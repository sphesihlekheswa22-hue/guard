import emailjs from "@emailjs/browser";

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const SOS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_SOS_TEMPLATE_ID;
const RESET_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_RESET_TEMPLATE_ID;
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

const ensureEmailJsConfig = (templateId?: string) => {
  if (!SERVICE_ID || !templateId || !PUBLIC_KEY) {
    throw new Error("EmailJS is not configured. Please set the VITE_EMAILJS environment variables.");
  }
};

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

const getRecipientEmail = (value: string) => {
  const recipientEmail = normalizeEmail(value || "");
  if (!isValidEmail(recipientEmail)) {
    throw new Error("Recipient email address is invalid.");
  }

  return recipientEmail;
};

const getEmailJsErrorMessage = (error: unknown) => {
  if (error && typeof error === "object") {
    const details = error as { status?: number; text?: string; message?: string };
    const status = details.status ? `EmailJS ${details.status}` : "EmailJS error";
    const text = details.text || details.message;

    return text ? `${status}: ${text}` : status;
  }

  return error instanceof Error ? error.message : "EmailJS failed to send the email.";
};

const sendEmailJs = async (templateId: string, params: Record<string, string>) => {
  try {
    return await emailjs.send(SERVICE_ID, templateId, params, PUBLIC_KEY);
  } catch (error) {
    console.error("EmailJS send failed:", error);
    throw new Error(getEmailJsErrorMessage(error));
  }
};

export const sendSOSEmail = async ({
  email,
  to_name,
  reporter_name,
  message,
  location,
  time,
}: {
  email: string;
  to_name: string;
  reporter_name: string;
  message: string;
  location: string;
  time: string;
}) => {
  ensureEmailJsConfig(SOS_TEMPLATE_ID);
  const recipientEmail = getRecipientEmail(email);

  console.log({
    serviceId: import.meta.env.VITE_EMAILJS_SERVICE_ID,
    templateId: import.meta.env.VITE_EMAILJS_SOS_TEMPLATE_ID,
    publicKey: import.meta.env.VITE_EMAILJS_PUBLIC_KEY,
    email: recipientEmail,
    to_name,
  });

  try {
    return await emailjs.send(
      import.meta.env.VITE_EMAILJS_SERVICE_ID,
      import.meta.env.VITE_EMAILJS_SOS_TEMPLATE_ID,
      {
        email: recipientEmail,
        to_name,
        reporter_name,
        message,
        location,
        time,
      },
      import.meta.env.VITE_EMAILJS_PUBLIC_KEY
    );
  } catch (error) {
    console.error("EmailJS send failed:", error);
    throw new Error(getEmailJsErrorMessage(error));
  }
};

export const sendResetPasswordEmail = async ({
  email,
  to_name,
  reset_link,
}: {
  email: string;
  to_name: string;
  reset_link: string;
}) => {
  ensureEmailJsConfig(RESET_TEMPLATE_ID);
  const recipientEmail = getRecipientEmail(email);
  const message = `Click this link to reset your password: ${reset_link}`;

  return sendEmailJs(
    RESET_TEMPLATE_ID,
    {
      to: recipientEmail,
      to_email: recipientEmail,
      email: recipientEmail,
      user_email: recipientEmail,
      recipient_email: recipientEmail,
      recipient: recipientEmail,
      to_name,
      name: to_name,
      reply_to: recipientEmail,
      reset_link,
      link: reset_link,
      resetLink: reset_link,
      password_reset_link: reset_link,
      url: reset_link,
      message,
    }
  );
};
