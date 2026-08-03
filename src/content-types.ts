export const campaignTypes = ['BRAND','INSIGHT','COMPANY_SPOTLIGHT','CAREER_TIP','WEEKLY_DIGEST','PRODUCT_UPDATE'] as const;
export type CampaignType = typeof campaignTypes[number];
export type Campaign = { id:number; type:CampaignType; name:string; prompt:string; enabled:boolean; weight:number; cooldownDays:number };
export type GeneratedContent = { id:number; campaignId:number; type:CampaignType; title:string; slug:string; excerpt:string; text:string; markdown:string; html:string; seoTitle:string; seoDescription:string; image:string|null; status:'draft'|'published'|'failed'; providerId:string|null; publishedAt:string|null; createdAt:string };
export type GeneratedDraft = Omit<GeneratedContent, 'id'|'campaignId'|'type'|'status'|'providerId'|'publishedAt'|'createdAt'>;
