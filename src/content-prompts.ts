import type { CampaignType } from './content-types.js';
export const campaignPrompts: Record<CampaignType,string> = {
  BRAND: 'Explain one concrete reason AIJolt exists or one advantage of combining verified AI jobs with career intelligence. Be authentic, specific, and never sound like marketing.',
  INSIGHT: 'Use the supplied live job statistics to reveal one useful AI hiring insight. Never invent, estimate, or alter a number.',
  COMPANY_SPOTLIGHT: 'Use the supplied active-job counts to explain what the most active company is hiring for and what candidates can learn from it.',
  CAREER_TIP: 'Use the supplied requested skills to give one practical, technically specific career action. Never write generic motivation.',
  WEEKLY_DIGEST: 'Explain what changed in the AI job market in the last seven days using only the supplied data.',
  PRODUCT_UPDATE: 'Explain a concrete AIJolt product capability and how it helps someone make a better AI career decision. Do not announce features that are not in the supplied context.',
};
