-- Schema-level invariant suite. Every rule the architecture claims is enforced by the
-- database is exercised here, positively and negatively. Run against a fresh database
-- with schema.sql applied.
\set ON_ERROR_STOP off
\set W1 '''11111111-1111-1111-1111-111111111111'''
\set W2 '''22222222-2222-2222-2222-222222222222'''
\set PROV '''{"origin_world_id":"11111111-1111-1111-1111-111111111111","origin_snapshot":"s0","origin_kind":"native"}'''

-- ── setup: ontology v1, primary world, genesis ──────────────────────────────
insert into ontology_version (id,status) values ('v1','active');
insert into object_type (id,ontology_version,name,key_property,properties) values
 ('Flight','v1','Flight','flight_no','{}'),
 ('Booking','v1','Booking','booking_id','{}'),
 ('MarketFact','v1','MarketFact','fact_id','{}');
insert into link_type (id,ontology_version,name,from_type,to_type,cardinality) values
 ('for','v1','Booking for Flight','Booking','Flight','one_to_many');
insert into action_type (id,ontology_version,name,parameters,touches,effect_class) values
 ('SetFare','v1','Set fare','{}','{Flight}','branchable'),
 ('AcceptBooking','v1','Accept booking','{}','{Booking}','irreversible');

insert into world (id,name,kind) values (:W1,'root','primary');
insert into onto_content (content_hash,kind,type_id,object_key,properties,bytes)
 values ('c0','object','Flight','AC795','{"flight_no":"AC795"}',64);
insert into onto_node (hash,kind,content_hash,provenance,bytes) values ('o0','object','c0',:PROV,96);
insert into onto_node (hash,kind,children,bytes) values ('t0','tree','{o0}',8);
insert into snapshot (id,world_id,seq,agent_version,ontology_version,ontology_root,cause)
 values ('s0',:W1,0,'agent-v1','v1','t0','{}');
insert into snapshot (id,world_id,seq,parent_id,agent_version,ontology_version,ontology_root,cause)
 values ('s0b',:W1,1,'s0','agent-v1','v1','t0','{}'),
        ('s0c',:W1,2,'s0b','agent-v1','v1','t0','{}');

\echo '--- T1  second primary world  → REJECT ---'
insert into world (name,kind,parent_world_id,fork_point) values ('evil','primary',:W1,'s0');
\echo '--- T2  non-root world with no fork point  → REJECT ---'
insert into world (name,kind,parent_world_id) values ('dangling','experiment',:W1);
\echo '--- T3  link type referencing an undeclared object type  → REJECT ---'
insert into link_type (id,ontology_version,name,from_type,to_type,cardinality)
 values ('bogus','v1','x','Booking','Spaceship','one_to_many');
\echo '--- T4  object node with NULL provenance  → REJECT (I5) ---'
insert into onto_node (hash,kind,content_hash,bytes) values ('o-null','object','c0',96);
\echo '--- T5  object node with empty-jsonb provenance  → REJECT (I5) ---'
insert into onto_node (hash,kind,content_hash,provenance,bytes) values ('o-empty','object','c0','{}',96);
\echo '--- T6  tree node carrying provenance  → REJECT (shape) ---'
insert into onto_node (hash,kind,children,provenance,bytes) values ('t-bad','tree','{o0}',:PROV,8);
\echo '--- T7  link content missing to_key  → REJECT (content_shape) ---'
insert into onto_content (content_hash,kind,type_id,from_key,properties,bytes)
 values ('c-bad','link','for','B1','{}',10);

\echo ''
\echo '--- T8  valid fork: child SHARES the parent root  → ACCEPT ---'
insert into world (id,name,kind,parent_world_id,fork_point,hypothesis)
 values (:W2,'exp','experiment',:W1,'s0','price +20%');
insert into snapshot (id,world_id,seq,parent_id,agent_version,ontology_version,ontology_root,cause)
 values ('s1',:W2,0,'s0','agent-v1','v1','t0','{}');
select w.name, s.ontology_root as shared_root from snapshot s join world w on w.id=s.world_id where s.id='s1';

\echo '--- T9  duplicate (world_id, seq)  → REJECT (I2) ---'
insert into snapshot (id,world_id,seq,agent_version,ontology_version,ontology_root,cause)
 values ('s-dup',:W2,0,'agent-v1','v1','t0','{}');
\echo '--- T10 undeclared action type  → REJECT (I7) ---'
insert into action_invocation (world_id,action_type_id,ontology_version,parameters,snapshot_before,invoked_by)
 values (:W2,'DropDatabase','v1','{}','s1','agent');

insert into snapshot (id,world_id,seq,parent_id,agent_version,ontology_version,ontology_root,cause)
 values ('s2',:W2,1,'s1','agent-v1','v1','t0','{}');

\echo '--- T11 irreversible action APPLIED from experiment world  → REJECT (I6) ---'
insert into action_invocation (world_id,action_type_id,ontology_version,parameters,snapshot_before,snapshot_after,status,invoked_by)
 values (:W2,'AcceptBooking','v1','{}','s1','s2','applied','agent');
\echo '--- T12 same action SUPPRESSED, WITH a snapshot  → ACCEPT (simulated counterfactual) ---'
insert into action_invocation (world_id,action_type_id,ontology_version,parameters,snapshot_before,snapshot_after,status,invoked_by)
 values (:W2,'AcceptBooking','v1','{}','s1','s2','suppressed','agent');
\echo '--- T13 irreversible action applied in PRIMARY  → ACCEPT ---'
insert into action_invocation (world_id,action_type_id,ontology_version,parameters,snapshot_before,snapshot_after,status,invoked_by)
 values (:W1,'AcceptBooking','v1','{}','s0','s0b','applied','ops');
\echo '--- T14 applied action with NO result snapshot  → REJECT ---'
insert into action_invocation (world_id,action_type_id,ontology_version,parameters,snapshot_before,status,invoked_by)
 values (:W2,'SetFare','v1','{}','s1','applied','agent');
\echo '--- T15 rejected action WITH a result snapshot  → REJECT ---'
insert into action_invocation (world_id,action_type_id,ontology_version,parameters,snapshot_before,snapshot_after,status,rejected_reason,invoked_by)
 values (:W2,'SetFare','v1','{}','s1','s2','rejected','nope','agent');
\echo '--- T16 result snapshot from the WRONG world  → REJECT ---'
insert into action_invocation (world_id,action_type_id,ontology_version,parameters,snapshot_before,snapshot_after,status,invoked_by)
 values (:W2,'SetFare','v1','{}','s1','s0b','applied','agent');

\echo ''
\echo '--- T17 lateral edge INTO THE SAME world  → REJECT (I8) ---'
insert into snapshot (id,world_id,seq,parent_id,lateral_source_id,agent_version,ontology_version,ontology_root,cause)
 values ('s-lat-bad',:W2,7,'s1','s1','agent-v1','v1','t0','{}');
\echo '--- T18 graft whose result records NO lateral edge  → REJECT (I8) ---'
insert into snapshot (id,world_id,seq,parent_id,agent_version,ontology_version,ontology_root,cause)
 values ('s-nolat',:W2,8,'s2','agent-v1','v1','t0','{}');
insert into graft (source_snapshot,target_world_id,result_snapshot,selector,mode)
 values ('s0c',:W2,'s-nolat','{"object_types":["MarketFact"]}','observed');
\echo '--- T19 assimilated graft without approval  → REJECT (ADR-003) ---'
insert into snapshot (id,world_id,seq,parent_id,lateral_source_id,agent_version,ontology_version,ontology_root,cause)
 values ('s3',:W2,2,'s2','s0c','agent-v1','v1','t0','{"kind":"graft"}');
insert into graft (source_snapshot,target_world_id,result_snapshot,selector,mode)
 values ('s0c',:W2,'s3','{"object_types":["MarketFact"]}','assimilated');
\echo '--- T20 observed graft with a proper lateral edge  → ACCEPT + auto-contaminate ---'
insert into graft (source_snapshot,target_world_id,result_snapshot,selector,mode)
 values ('s0c',:W2,'s3','{"object_types":["MarketFact"]}','observed');
select name, kind, contaminated from world order by kind;

\echo ''
\echo '--- T21 ancestry DAG reaches into the OTHER world (rev.2 could not) ---'
select a.ancestor_id, w.name as world, a.depth, a.path_kind
  from ancestry a join snapshot s on s.id=a.ancestor_id join world w on w.id=s.world_id
 where a.snapshot_id='s3' order by a.path_kind, a.depth;

\echo '--- T22 "did this state come from another world?" in one query ---'
select exists(select 1 from ancestry where snapshot_id='s3' and path_kind='lateral') as s3_imported,
       exists(select 1 from ancestry where snapshot_id='s1' and path_kind='lateral') as s1_imported;

\echo ''
\echo '--- T23 promote into a NON-primary world  → REJECT (ADR-001) ---'
insert into promotion (source_world_id,target_world_id,replayed_actions,approved_by)
 values (:W1,:W2,'{}','brandon');
\echo '--- T24 promote experiment → primary  → ACCEPT ---'
insert into promotion (source_world_id,target_world_id,replayed_actions,approved_by)
 values (:W2,:W1,'{}','brandon');
select status from promotion;
