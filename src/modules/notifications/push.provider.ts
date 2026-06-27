export type NewEmailPush = { emailId: string; senderName: string; subject: string; sound: boolean };
export type PushResult = { invalidTokens: string[] };

export abstract class PushProvider {
  abstract sendNewEmail(tokens: string[], payload: NewEmailPush): Promise<PushResult>;
}
