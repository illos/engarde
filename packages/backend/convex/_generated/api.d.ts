/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as authz from "../authz.js";
import type * as campaigns from "../campaigns.js";
import type * as characters from "../characters.js";
import type * as crons from "../crons.js";
import type * as emailDelivery from "../emailDelivery.js";
import type * as emailRateLimits from "../emailRateLimits.js";
import type * as encounters from "../encounters.js";
import type * as http from "../http.js";
import type * as instance from "../instance.js";
import type * as lobby from "../lobby.js";
import type * as operators from "../operators.js";
import type * as profiles from "../profiles.js";
import type * as rateLimits from "../rateLimits.js";
import type * as retention from "../retention.js";
import type * as sessions from "../sessions.js";
import type * as verbatimFixtures from "../verbatimFixtures.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  authz: typeof authz;
  campaigns: typeof campaigns;
  characters: typeof characters;
  crons: typeof crons;
  emailDelivery: typeof emailDelivery;
  emailRateLimits: typeof emailRateLimits;
  encounters: typeof encounters;
  http: typeof http;
  instance: typeof instance;
  lobby: typeof lobby;
  operators: typeof operators;
  profiles: typeof profiles;
  rateLimits: typeof rateLimits;
  retention: typeof retention;
  sessions: typeof sessions;
  verbatimFixtures: typeof verbatimFixtures;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
