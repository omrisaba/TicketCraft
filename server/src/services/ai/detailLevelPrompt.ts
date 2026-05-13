import type { DetailLevel } from 'ticketcraft-shared';

const DETAIL_INSTRUCTIONS: Record<DetailLevel, string> = {
  high: `## DETAIL LEVEL: STRATEGIC (HLD)

This ticket is high-level (e.g., Epic or Initiative). Focus on:
- Business context, goals, and success metrics
- High-level architecture and system boundaries
- Team dependencies, milestones, and phasing
- Scope: what's in and what's out
- Risks and mitigation strategies

Do NOT reference specific files, functions, code paths, or implementation details.
Keep the language accessible to product managers and architects.`,

  medium: `## DETAIL LEVEL: BALANCED

Provide a balanced level of detail:
- Context and rationale for the work
- Technical approach referencing relevant modules, services, or components (e.g., "the auth service", "the payments module")
- Acceptance criteria with testable, specific behaviors
- Light code references are acceptable where they clarify scope, but avoid line-level detail
- Suggested labels and story points grounded in the complexity you see`,

  low: `## DETAIL LEVEL: IMPLEMENTATION (LLD)

This ticket needs implementation-level detail. Be highly specific:
- Reference exact file paths, function names, class names, and APIs from the codebase
- Describe the current implementation and what needs to change
- Include code snippets or pseudo-code where helpful
- List specific test cases and edge cases
- Acceptance criteria should be independently verifiable with concrete inputs/outputs
- Technical approach should read like a mini design doc with step-by-step implementation guidance`,
};

export function detailLevelPromptSection(level: DetailLevel | undefined): string {
  if (!level) return '';
  return '\n' + DETAIL_INSTRUCTIONS[level] + '\n';
}
