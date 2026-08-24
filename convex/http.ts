import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();

// Mounts the Convex Auth endpoints (sign-in, token refresh, sign-out).
auth.addHttpRoutes(http);

export default http;
