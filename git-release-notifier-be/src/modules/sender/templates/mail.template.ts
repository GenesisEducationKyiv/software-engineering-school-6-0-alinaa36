export const getReleaseEmailTemplate = (
  repoName: string,
  tagName: string,
  unsubscribeUrl: string,
): string => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 10px;">
      <h2 style="color: #2b3137;"> Новий реліз на GitHub!</h2>
      <p style="font-size: 16px; color: #24292e;">
        Привіт! Репозиторій, за яким ти стежиш, щойно оновився.
      </p>
      <div style="background-color: #f6f8fa; padding: 15px; border-radius: 6px; margin: 20px 0;">
        <p style="margin: 0; font-size: 18px;">📦 <strong>Репозиторій:</strong> ${repoName}</p>
        <p style="margin: 10px 0 0 0; font-size: 18px; color: #0366d6;">🏷️ <strong>Тег:</strong> ${tagName}</p>
      </div>
      <div style="text-align: center;">
        <a href="https://github.com/${repoName}/releases/tag/${tagName}" 
           style="display: inline-block; background-color: #2ea44f; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
          Переглянути на GitHub
        </a>
      </div>
      
      <hr style="border: 0; border-top: 1px solid #eaeaea; margin: 30px 0;">
      
      <p style="font-size: 12px; color: #6a737d; text-align: center;">
        Ви отримали цей лист, бо підписалися на оновлення через Git Release Notifier.
        <br><br>
        <a href="${unsubscribeUrl}" style="color: #0366d6; text-decoration: underline;">
          Скасувати підписку на цей репозиторій
        </a>
      </p>
    </div>
  `;
};

export const getConfirmationEmailTemplate = (repoName: string, confirmUrl: string): string => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 10px;">
      <h2 style="color: #2b3137;"> Підтвердження підписки</h2>
      <p style="font-size: 16px; color: #24292e;">
        Ви (або хтось інший) запросили підписку на оновлення репозиторію <strong>${repoName}</strong>.
      </p>
      <p style="font-size: 16px; color: #24292e;">
        Щоб почати отримувати сповіщення про нові релізи, будь ласка, підтвердіть свою електронну адресу, натиснувши на кнопку нижче:
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${confirmUrl}" 
           style="display: inline-block; background-color: #2ea44f; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
          Підтвердити підписку
        </a>
      </div>
      <p style="margin-top: 30px; font-size: 12px; color: #6a737d;">
        Якщо ви не робили цей запит, просто проігноруйте цей лист. 
        <br>Посилання дійсне для одноразового використання.
      </p>
    </div>
  `;
};
