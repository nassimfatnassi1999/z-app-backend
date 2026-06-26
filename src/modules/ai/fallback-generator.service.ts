import { Injectable } from '@nestjs/common';
import { EmailPlan, GeneratedEmailResponse } from './ai.types';

@Injectable()
export class FallbackGeneratorService {
  generate(plan: EmailPlan, confidence: number): GeneratedEmailResponse {
    const template = templates[plan.language];
    const recipient = plan.recipient || '';
    const context = this.context(plan);
    return {
      subject: template.subject(plan.subjectHint),
      body: template.body(recipient, context),
      language: plan.language,
      outputLanguage: plan.language,
      purpose: plan.intent.purpose,
      recipient,
      detectedLanguage: plan.transcriptLanguage,
      confidence,
      extractedEntities: plan.entities,
      suggestedRecipient: recipient,
      tone: plan.tone,
      intent: plan.intent.purpose,
      provider: 'local-fallback',
    };
  }

  private context(plan: EmailPlan) {
    const parts = [
      plan.goal,
      plan.entities.dateText ? `Timing: ${plan.entities.dateText}` : '',
      plan.entities.time ? `Time: ${plan.entities.time}` : '',
      plan.entities.location ? `Location: ${plan.entities.location}` : '',
    ];
    return parts.filter(Boolean).join('. ');
  }
}

const templates = {
  fr: {
    subject: (hint: string) => hint,
    body: (recipient: string, context: string) =>
      `Bonjour${recipient ? ` ${recipient}` : ''},\n\nJe me permets de vous contacter concernant ${context}. Je serais ravi d'échanger avec vous et de convenir des prochaines étapes selon vos disponibilités.\n\nJe vous remercie par avance pour votre retour.\n\nCordialement,`,
  },
  en: {
    subject: (hint: string) => hint,
    body: (recipient: string, context: string) =>
      `Dear${recipient ? ` ${recipient}` : ''},\n\nI hope you are well. I am writing regarding ${context}. I would appreciate the opportunity to discuss this further and agree on the next steps at your convenience.\n\nThank you for your time and consideration.\n\nBest regards,`,
  },
  ar: {
    subject: (hint: string) => hint,
    body: (recipient: string, context: string) =>
      `مرحباً${recipient ? ` ${recipient}` : ''}،\n\nأتواصل معكم بخصوص ${context}. يسعدني مناقشة هذا الموضوع معكم وتحديد الخطوات القادمة حسب ما يناسبكم.\n\nشكراً جزيلاً لوقتكم واهتمامكم.\n\nمع خالص التحية،`,
  },
  de: {
    subject: (hint: string) => hint,
    body: (recipient: string, context: string) =>
      `Guten Tag${recipient ? ` ${recipient}` : ''},\n\nich wende mich an Sie bezüglich ${context}. Gerne würde ich dies weiter mit Ihnen besprechen und die nächsten Schritte nach Ihrer Verfügbarkeit abstimmen.\n\nVielen Dank im Voraus für Ihre Rückmeldung.\n\nMit freundlichen Grüßen`,
  },
  es: {
    subject: (hint: string) => hint,
    body: (recipient: string, context: string) =>
      `Estimado/a${recipient ? ` ${recipient}` : ''},\n\nEspero que se encuentre bien. Le escribo en relación con ${context}. Me gustaría poder conversar sobre este tema y acordar los próximos pasos según su disponibilidad.\n\nGracias de antemano por su atención.\n\nAtentamente,`,
  },
  it: {
    subject: (hint: string) => hint,
    body: (recipient: string, context: string) =>
      `Gentile${recipient ? ` ${recipient}` : ''},\n\nla contatto in merito a ${context}. Sarei lieto di approfondire l'argomento e concordare i prossimi passi in base alla sua disponibilità.\n\nLa ringrazio anticipatamente per il riscontro.\n\nCordiali saluti,`,
  },
  pt: {
    subject: (hint: string) => hint,
    body: (recipient: string, context: string) =>
      `Prezado/a${recipient ? ` ${recipient}` : ''},\n\nEspero que esteja bem. Escrevo a respeito de ${context}. Gostaria de conversar sobre este assunto e alinhar os próximos passos conforme a sua disponibilidade.\n\nAgradeço desde já pela atenção.\n\nAtenciosamente,`,
  },
  nl: {
    subject: (hint: string) => hint,
    body: (recipient: string, context: string) =>
      `Beste${recipient ? ` ${recipient}` : ''},\n\nIk neem contact met u op over ${context}. Ik bespreek dit graag verder met u en stem de volgende stappen af op basis van uw beschikbaarheid.\n\nAlvast bedankt voor uw reactie.\n\nMet vriendelijke groet,`,
  },
  tr: {
    subject: (hint: string) => hint,
    body: (recipient: string, context: string) =>
      `Sayın${recipient ? ` ${recipient}` : ''},\n\n${context} konusunda sizinle iletişime geçiyorum. Bu konuyu daha ayrıntılı görüşmek ve uygunluğunuza göre sonraki adımları belirlemek isterim.\n\nZamanınız ve değerlendirmeniz için teşekkür ederim.\n\nSaygılarımla,`,
  },
};
