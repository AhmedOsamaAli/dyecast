import { blob, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { HairProfileData, StudioInput } from "@/lib/checks/validation";
import type { CheckReport } from "@/lib/checks/report";

const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).notNull();

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    /** Null for accounts that only sign in with Google. */
    passwordHash: text("password_hash"),
    displayName: text("display_name").notNull(),
    emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
    /** Opt-in: keep the selfie (encrypted) so previews work on any device. */
    storePhotos: integer("store_photos", { mode: "boolean" }).notNull().default(false),
    /** Per-user photo data key, wrapped (encrypted) with the server key. Deleting it crypto-shreds all photos. */
    photoKey: text("photo_key"),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

/** Linked sign-in providers (Google). */
export const oauthAccounts = sqliteTable(
  "oauth_accounts",
  {
    provider: text("provider", { enum: ["google"] }).notNull(),
    providerUserId: text("provider_user_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerUserId] }), index("oauth_accounts_user_idx").on(t.userId)],
);

/** Encrypted photos (AES-256-GCM with the user's data key). Only stored when the user opts in. */
export const photos = sqliteTable(
  "photos",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["selfie"] }).notNull(),
    mime: text("mime", { enum: ["image/jpeg", "image/png"] }).notNull(),
    bytes: integer("bytes").notNull(),
    iv: text("iv").notNull(),
    data: blob("data", { mode: "buffer" }).notNull(),
    createdAt: createdAt(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("photos_user_idx").on(t.userId, t.kind)],
);

/** YouCam file ids uploaded for a user, so render requests can only reference the caller's own uploads. */
export const youcamFiles = sqliteTable(
  "youcam_files",
  {
    fileId: text("file_id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [index("youcam_files_user_idx").on(t.userId)],
);

/** Session ids are SHA-256 hashes of the cookie token, so a leaked database can't be replayed. */
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Fixed-window counters for login attempts and API calls. */
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStart: integer("window_start", { mode: "timestamp_ms" }).notNull(),
});

/** Every YouCam task we start, for per-user budgets and transparency in settings. */
export const apiUsage = sqliteTable(
  "api_usage",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    feature: text("feature").notNull(),
    units: real("units").notNull(),
    taskId: text("task_id").notNull(),
    status: text("status", { enum: ["created", "success", "error"] }).notNull(),
    mock: integer("mock", { mode: "boolean" }).notNull(),
    /** Hair-color render URL (valid ~2h at YouCam); proxied, never sent to the browser. */
    resultUrl: text("result_url"),
    /** Set only after YouCam confirms deletion; null tasks stay queued for cleanup. */
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("api_usage_user_idx").on(t.userId, t.createdAt),
    uniqueIndex("api_usage_task_idx").on(t.taskId),
    index("api_usage_cleanup_idx").on(t.deletedAt, t.createdAt),
  ],
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;

export const hairProfiles = sqliteTable("hair_profiles", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  profile: text("profile", { mode: "json" }).$type<HairProfileData>().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const savedChecks = sqliteTable(
  "saved_checks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    input: text("input", { mode: "json" }).$type<StudioInput>().notNull(),
    report: text("report", { mode: "json" }).$type<CheckReport>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("saved_checks_user_idx").on(t.userId, t.createdAt)],
);
