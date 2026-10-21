/**
 * Domain types and schemas for TASK primitive artifacts.
 */

export interface TaskFrontmatter {
  depends_on?: string[];
  links?: string[];
}

export interface TaskAcceptanceCriteriaItem {
  text: string;
  completed: boolean;
}

export interface TaskArtifact {
  id: string;
  slug: string;
  title?: string;
  depends_on: string[];
  links: string[];
  context?: string;
  acceptanceCriteria: TaskAcceptanceCriteriaItem[];
  rawContent?: string;
  filePath?: string;
}

export interface TaskRenderOptions {
  id: string | number;
  slug?: string;
  title?: string;
  depends_on?: string[];
  links?: string[];
  context?: string;
  acceptanceCriteria?: (string | TaskAcceptanceCriteriaItem)[];
}
