import dns from "node:dns";
import { config } from "dotenv";

// Some networks/timeouts behave badly when Node tries IPv6 first. Worker runs should prefer IPv4.
dns.setDefaultResultOrder("ipv4first");

config({ path: ".env.local" });
config({ path: ".env" });
