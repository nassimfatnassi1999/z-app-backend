import { z } from 'zod';
import { recipientTypeSchema } from '../schemas/ai.schemas';

export const RECIPIENT_STYLE_RULES_VERSION = '2.0.0';

type RecipientType = z.infer<typeof recipientTypeSchema>;

export const recipientStyleRules: Record<
  RecipientType,
  {
    formality: string;
    preferredTones: readonly string[];
    greetingStyle: string;
    closingStyle: string;
  }
> = {
  manager: {
    formality: 'formal',
    preferredTones: ['professional', 'respectful'],
    greetingStyle: 'respectful',
    closingStyle: 'professional',
  },
  management: {
    formality: 'very_formal',
    preferredTones: ['formal', 'respectful'],
    greetingStyle: 'respectful',
    closingStyle: 'professional',
  },
  colleague: {
    formality: 'semi_formal',
    preferredTones: ['professional', 'friendly'],
    greetingStyle: 'natural',
    closingStyle: 'light_professional',
  },
  team: {
    formality: 'semi_formal',
    preferredTones: ['professional', 'supportive'],
    greetingStyle: 'collective',
    closingStyle: 'light_professional',
  },
  friend: {
    formality: 'casual',
    preferredTones: ['friendly', 'warm'],
    greetingStyle: 'friendly',
    closingStyle: 'casual',
  },
  client: {
    formality: 'professional',
    preferredTones: ['professional', 'respectful'],
    greetingStyle: 'business',
    closingStyle: 'service_oriented',
  },
  prospect: {
    formality: 'business',
    preferredTones: ['professional', 'persuasive'],
    greetingStyle: 'business',
    closingStyle: 'service_oriented',
  },
  supplier: {
    formality: 'business',
    preferredTones: ['professional', 'respectful'],
    greetingStyle: 'business',
    closingStyle: 'action_oriented',
  },
  hr: {
    formality: 'formal',
    preferredTones: ['professional', 'respectful'],
    greetingStyle: 'respectful',
    closingStyle: 'professional',
  },
  teacher: {
    formality: 'formal',
    preferredTones: ['respectful', 'professional'],
    greetingStyle: 'respectful',
    closingStyle: 'formal',
  },
  university: {
    formality: 'very_formal',
    preferredTones: ['formal', 'respectful'],
    greetingStyle: 'formal',
    closingStyle: 'formal',
  },
  administration: {
    formality: 'very_formal',
    preferredTones: ['formal', 'respectful'],
    greetingStyle: 'formal',
    closingStyle: 'formal',
  },
  partner: {
    formality: 'business',
    preferredTones: ['professional', 'confident'],
    greetingStyle: 'business',
    closingStyle: 'professional',
  },
  support: {
    formality: 'professional',
    preferredTones: ['professional', 'neutral'],
    greetingStyle: 'neutral',
    closingStyle: 'action_oriented',
  },
  unknown: {
    formality: 'professional',
    preferredTones: ['professional', 'neutral'],
    greetingStyle: 'neutral',
    closingStyle: 'professional',
  },
};
