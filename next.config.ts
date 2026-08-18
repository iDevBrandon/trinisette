import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // `examples/` earns its place in the path: it tells a visitor this is a demo before
    // they click, which matches how the case study frames it — in design, not shipped.
    // Earlier shapes redirect so any link already shared keeps working.
    return [
      { source: "/examples/airport-now", destination: "/examples/airport", permanent: false },
      { source: "/airport-now", destination: "/examples/airport", permanent: false },
      { source: "/a", destination: "/examples/airport", permanent: false },
      { source: "/a/:iata/:terminal", destination: "/examples/airport", permanent: false },
    ];
  },
};

export default nextConfig;
