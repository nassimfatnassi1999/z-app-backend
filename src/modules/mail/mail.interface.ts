export type VerificationEmailParams = {
  to: string;
  name?: string;
  code: string;
  expiresInMinutes: number;
};

export interface MailProvider {
  sendVerificationEmail(params: VerificationEmailParams): Promise<void>;
}
