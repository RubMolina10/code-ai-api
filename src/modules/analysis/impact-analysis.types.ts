import {
  AnalysisFinding
} from './analysis.types';


export interface ImpactRelatedFile {

  path: string;

  matchedTerms: string[];

  score: number;

  content: string;

}


export interface ImpactAnalysisResponse {

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

  extractedSymbols: string[];

  scannedFiles: number;

  relatedFiles: Array<{

    path: string;

    matchedTerms: string[];

    score: number;

  }>;

}