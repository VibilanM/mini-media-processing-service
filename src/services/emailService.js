import { Resend } from "resend";
import dotenv from "dotenv";

dotenv.config();

async function sendVerificationEmail(toEmail, verificationToken) {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey || apiKey.startsWith("re_xxxx") || apiKey.includes("xxxxxxxx")) {
        console.warn("[Email] RESEND_API_KEY is not configured with a valid key. Skipping email sending.");
        return { success: false, message: "Skipped: RESEND_API_KEY not configured" };
    }

    try {
        const resend = new Resend(apiKey);
        const EMAIL_FROM = process.env.EMAIL_FROM || "Media Processing Service <onboarding@resend.dev>";
        const verifyUrl = `${process.env.CLIENT_URL || "http://localhost:5173"}/verify/${verificationToken}`;

        const { data, error } = await resend.emails.send({
            from: EMAIL_FROM,
            to: [toEmail],
            subject: "Verify your email — Media Processing Service",
            html: `
                <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
                    <h2>Welcome to Media Processing Service</h2>
                    <p>Click the button below to verify your email address:</p>
                    <a href="${verifyUrl}"
                       style="display: inline-block; padding: 12px 24px; background: #4f46e5; color: #fff;
                              text-decoration: none; border-radius: 6px; margin: 16px 0;">
                        Verify Email
                    </a>
                    <p style="color: #666; font-size: 14px;">
                        Or copy and paste this link into your browser:<br/>
                        <code>${verifyUrl}</code>
                    </p>
                    <p style="color: #999; font-size: 12px;">
                        If you didn't create an account, you can safely ignore this email.
                    </p>
                </div>
            `,
        });

        if (error) {
            console.error("[Email] Failed to send verification email:", error);
            return { success: false, error };
        }

        console.log(`[Email] Verification email sent to ${toEmail} (ID: ${data?.id})`);
        return { success: true, id: data?.id };
    } catch (err) {
        console.error("[Email] Error sending email:", err.message);
        return { success: false, error: err.message };
    }
}

export { sendVerificationEmail };
