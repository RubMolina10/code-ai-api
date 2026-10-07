export type AnalysisSeverity =
  'Critical' |
  'High' |
  'Medium' |
  'Low';


export type AnalysisRiskLevel =
  'Critical' |
  'High' |
  'Medium' |
  'Low';


export interface AnalysisFileInput {

  filename: string;

  status: string;

  additions: number;

  deletions: number;

  changes: number;

  patch?: string;

}


export interface AnalysisFinding {

  severity: AnalysisSeverity;

  category: string;

  title: string;

  description: string;

  suggestion: string;

  filePath: string;

  lineNumber: number;

}


export interface AIAnalysisResult {

  codeHealth: number;

  riskLevel: AnalysisRiskLevel;

  summary: string;

  findings: AnalysisFinding[];

}


export interface AnalyzeCodeRequest {

  projectName: string;

  technologies: string[];

  branch: string;

  commitSha: string;

  commitMessage: string;

  files: AnalysisFileInput[];

}


export interface StartCommitAnalysisRequest {

  projectId: number;

  branch: string;

  commitSha: string;

}


export interface AnalysisResponse {

  id: number;

  projectId: number;

  projectName: string;

  branch: string;

  commitSha: string;

  status: string;

  modelName: string;

  codeHealth: number;

  riskLevel: string;

  summary: string;

  findings: AnalysisFinding[];

}