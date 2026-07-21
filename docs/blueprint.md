# GroupGuardian Moderation Bot — Bot specification

**Archetype:** community

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

Automated moderation bot for Telegram communities with human verification, spam detection, admin controls, and moderation logs. Enforces rules through configurable thresholds, provides transparent explanations for actions, and maintains a rolling event log accessible to admins.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Telegram group owners
- Community moderators

## Success criteria

- Automated verification and spam detection with configurable thresholds
- Admin-accessible moderation log with 500-event capacity
- Transparent public explanations for all automated actions

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open main moderation menu for admins
- **/log** (command, actor: admin, command: /log) — View moderation event log
  - outputs: List of recent moderation events
- **I'm human** (button, actor: user, callback: verify:human) — Complete verification challenge
  - inputs: User ID, Join timestamp
  - outputs: Verification status update

## Flows

### New member verification
_Trigger:_ User joins group

1. Send welcome message with rules
2. Display verification button
3. Restrict posting privileges
4. Auto-remove if not verified within 3 minutes

_Data touched:_ Member, Verification challenge

### Spam detection
_Trigger:_ Message posted by new member

1. Check message flood patterns
2. Evaluate against configured thresholds
3. Apply warn/mute/kick sequence
4. Post public explanation

_Data touched:_ Moderation event, Member

### Admin moderation
_Trigger:_ /moderation command

1. Display admin controls
2. Execute selected action (warn/mute/kick/ban)
3. Update moderation log
4. Send confirmation to admin

_Data touched:_ Moderation event, Bot-config

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **Member** _(retention: persistent)_ — User profile with moderation status
  - fields: user_id, join_time, verified, trusted, message_count
- **Verification challenge** _(retention: session)_ — Human verification state
  - fields: user_id, timestamp, expires_at
- **Moderation event** _(retention: persistent)_ — Record of moderation actions
  - fields: action_type, actor, target, reason, timestamp
- **Bot-config** _(retention: persistent)_ — Moderation rules and thresholds
  - fields: welcome_text, rules_text, enabled_detectors, thresholds, trusted_users

## Integrations

- **Telegram** (required) — Bot API messaging and moderation
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Configure welcome/rules messages
- Set spam thresholds
- Toggle detectors
- Manage trusted users
- View moderation log
- Export summary stats

## Notifications

- Public moderation explanations in group chat
- Admin log updates via /log command

## Permissions & privacy

- Never act on admin users or pinned messages
- Verification status stored securely
- Moderation log accessible only to admins

## Edge cases

- Multiple simultaneous spam triggers from single user
- Verification timeout during active conversation
- Conflicting moderation actions from multiple admins

## Required tests

- End-to-end verification flow with timeout handling
- Spam detection with progressive discipline sequence
- Admin log accessibility and retention limits

## Assumptions

- Default 3-minute verification window is optimal for bot prevention
- Message flood is primary spam vector to monitor
- Progressive discipline reduces accidental removals
