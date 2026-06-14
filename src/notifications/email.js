import nodemailer from "nodemailer";

export class NotificationService {
  constructor({ config, store }) {
    this.config = config;
    this.store = store;
    this.transporter = null;
  }

  async getTransporter() {
    if (!this.config.email.smtpUrl || !this.config.email.to) return null;
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport(this.config.email.smtpUrl);
    }
    return this.transporter;
  }

  async approvalRequested({ task, approval }) {
    const transporter = await this.getTransporter();
    if (!transporter) {
      await this.store.appendAudit({
        taskId: task.id,
        actor: "notification",
        eventType: "notification.email_skipped",
        detail: { reason: "smtp_not_configured", approvalId: approval.id }
      });
      return;
    }

    const url = `${this.config.baseUrl}/dashboard/tasks/${task.id}`;
    await transporter.sendMail({
      to: this.config.email.to,
      from: this.config.email.from,
      subject: `AI Link approval required: ${approval.title}`,
      text: [
        "AI Link needs your confirmation before a high-risk action continues.",
        "",
        `Task: ${task.id}`,
        `Approval: ${approval.id}`,
        `Summary: ${approval.summary}`,
        "",
        `Open the private console: ${url}`
      ].join("\n")
    });
    await this.store.appendAudit({
      taskId: task.id,
      actor: "notification",
      eventType: "notification.email_sent",
      detail: { approvalId: approval.id }
    });
  }
}
