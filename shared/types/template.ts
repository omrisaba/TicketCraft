export type TicketTemplateType = 'bug' | 'feature' | 'spike' | 'tech-debt';

export interface TicketTemplate {
  type: TicketTemplateType;
  name: string;
  description: string;
  structure: TemplateSection[];
  guidingPrompts: string[];
}

export interface TemplateSection {
  heading: string;
  placeholder: string;
  required: boolean;
}
