import type { TicketTemplate, TicketTemplateType } from 'ticketcraft-shared';

const TEMPLATES: Record<TicketTemplateType, TicketTemplate> = {
  bug: {
    type: 'bug',
    name: 'Bug Report',
    description: 'Template for reporting software defects',
    structure: [
      { heading: 'Summary', placeholder: 'Brief description of the bug', required: true },
      { heading: 'Steps to Reproduce', placeholder: '1. Step one\n2. Step two\n3. ...', required: true },
      { heading: 'Expected Behavior', placeholder: 'What should happen', required: true },
      { heading: 'Actual Behavior', placeholder: 'What actually happens', required: true },
      { heading: 'Environment', placeholder: 'OS, browser, version, etc.', required: true },
      { heading: 'Severity', placeholder: 'Critical / Major / Minor / Cosmetic', required: true },
      { heading: 'Screenshots / Logs', placeholder: 'Attach relevant screenshots or log output', required: false },
      { heading: 'Workaround', placeholder: 'Any known workaround', required: false },
    ],
    guidingPrompts: [
      'Can you reproduce this consistently?',
      'When did this start happening?',
      'Does this affect all users or specific ones?',
      'What is the business impact?',
    ],
  },
  feature: {
    type: 'feature',
    name: 'Feature Request',
    description: 'Template for new feature development',
    structure: [
      { heading: 'User Story', placeholder: 'As a [role], I want [capability] so that [benefit]', required: true },
      { heading: 'Description', placeholder: 'Detailed description of the feature', required: true },
      { heading: 'Acceptance Criteria', placeholder: 'Given/When/Then or checklist', required: true },
      { heading: 'Scope', placeholder: 'What is included in this ticket', required: true },
      { heading: 'Out of Scope', placeholder: 'What is explicitly excluded', required: false },
      { heading: 'Technical Notes', placeholder: 'Architecture decisions, API changes, etc.', required: false },
      { heading: 'Design / Mockups', placeholder: 'Links to designs or attached mockups', required: false },
      { heading: 'Dependencies', placeholder: 'Other tickets or systems this depends on', required: false },
    ],
    guidingPrompts: [
      'Who is the primary user persona for this feature?',
      'What problem does this solve?',
      'How will success be measured?',
      'Are there any performance requirements?',
    ],
  },
  spike: {
    type: 'spike',
    name: 'Spike / Research',
    description: 'Template for technical investigation and research tasks',
    structure: [
      { heading: 'Objective', placeholder: 'What are we trying to learn or decide?', required: true },
      { heading: 'Research Questions', placeholder: 'Specific questions to answer', required: true },
      { heading: 'Timebox', placeholder: 'Maximum time to spend (e.g., 2 days)', required: true },
      { heading: 'Expected Output', placeholder: 'What deliverable is expected? (doc, POC, ADR)', required: true },
      { heading: 'Decision Criteria', placeholder: 'How will we evaluate options?', required: false },
      { heading: 'Background / Context', placeholder: 'Why is this research needed now?', required: false },
    ],
    guidingPrompts: [
      'What decision will this spike inform?',
      'Are there known options to evaluate?',
      'Who are the stakeholders for the findings?',
      'What happens if the spike is inconclusive?',
    ],
  },
  'tech-debt': {
    type: 'tech-debt',
    name: 'Technical Debt',
    description: 'Template for addressing technical debt and refactoring',
    structure: [
      { heading: 'Current State', placeholder: 'What is the problem with the current implementation?', required: true },
      { heading: 'Desired State', placeholder: 'What should it look like after this work?', required: true },
      { heading: 'Impact', placeholder: 'How does this debt affect velocity, reliability, etc.?', required: true },
      { heading: 'Migration Plan', placeholder: 'Step-by-step plan for the migration/refactor', required: true },
      { heading: 'Risks', placeholder: 'What could go wrong? How to mitigate?', required: false },
      { heading: 'Testing Strategy', placeholder: 'How to verify the refactor is correct?', required: false },
      { heading: 'Rollback Plan', placeholder: 'How to revert if something goes wrong', required: false },
    ],
    guidingPrompts: [
      'How old is this technical debt?',
      'What is the blast radius if something goes wrong?',
      'Can this be done incrementally?',
      'Are there dependent systems that need coordination?',
    ],
  },
};

export class TemplateRepository {
  listTemplates(): TicketTemplate[] {
    return Object.values(TEMPLATES);
  }

  getTemplate(type: string): TicketTemplate | undefined {
    return TEMPLATES[type as TicketTemplateType];
  }
}
