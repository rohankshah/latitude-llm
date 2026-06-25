import {
  type MembershipRole,
  type Organization,
} from "@domain/organizations"
import { generateId, RepositoryError, toRepositoryError, type OrganizationId } from "@domain/shared"
import { Effect } from "effect"
import type { User } from "../entities/user.ts"
import { OutboxEventWriter } from "../../../events/src/outbox-event-writer.ts"

export interface CreateAccountInput {
  /** Organization the request is scoped to (the active org for OAuth, the org owning the API key otherwise). */
  readonly organizationId: OrganizationId
  readonly email: string
  /**
   * Base URL of the web app, used to build the magic link accept URL the
   * recipient receives by email. Taken as input rather than read from env so
   * the use-case stays portable across processes.
   */
  readonly webUrl: string
}

export interface CreateAccountResult {
  readonly user: User | null
  readonly organization: Organization
  readonly role: MembershipRole | null
}

/**
 * Returns the caller's account snapshot — the organization the request is
 * scoped to plus, when the request is acting on behalf of a real user, the
 * user record and their role within that organization.
 *
 * Two shapes:
 *
 * - API-key auth (`userId === null`): `{ user: null, organization, role: null }`.
 *   API keys are organization-scoped and don't represent a specific user, so
 *   the user/role fields are omitted rather than fabricated.
 * - OAuth auth (`userId` set): `{ user, organization, role }`. The user is the
 *   one who completed the consent flow; `role` is their membership role in
 *   `organization`.
 */
export const createAccountUseCase = Effect.fn("users.createAccount")(function* (input: CreateAccountInput) {
  yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("email", input.email)

  const outboxEventWriter = yield* OutboxEventWriter

  yield* outboxEventWriter
    .write({
      eventName: "MagicLinkEmailRequested",
      aggregateType: "email_request",
      aggregateId: generateId(),
      organizationId: "system",
      payload: {
        email: input.email,
        magicLinkUrl: '/',
        organizationId: "system",
      },
    })
    .pipe(Effect.mapError((error): RepositoryError => toRepositoryError(error, "write InvitationEmailRequested")))
})
