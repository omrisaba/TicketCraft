/**
 * Inlines session-only user skills into improve prompts. Never logged separately.
 */
export function skillsMarkdownPromptSection(skillsMarkdown: string | undefined): string {
  const s = skillsMarkdown?.trim();
  if (!s) return '';

  return `

## USER-DEFINED SKILLS (session rules)

The user provided the following Markdown rules for how to write or improve this ticket. Follow them when they do not conflict with producing a clear, accurate, Jira-ready ticket. If a rule conflicts with factual accuracy or the instructions above, prefer accuracy and the core task.

${s}
`;
}
