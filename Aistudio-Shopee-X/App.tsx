const removeBackground = async (imageSrc: string, index: number) => {
  try {
    // 从 data URL 中提取 base64 数据和 MIME 类型
    const base64Data = imageSrc.split(',')[1];
    const mimeType = imageSrc.split(';')[0].split(':')[1] || 'image/png';

    // 使用 gemini-2.5-flash-image 模型并优化提示词
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType
            }
          },
          {
            text: 'Please remove the background of this image and return a transparent background image. Focus on accurately extracting the main subject/object from the background. Ensure the edges are clean and the transparency is properly handled.'
          }
        ]
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1"
        }
      }
    });

    // 检查响应是否包含生成的图像
    if (response.candidates && response.candidates[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          const newImageData = `data:image/png;base64,${part.inlineData.data}`;

          // 更新本地上传的图片列表
          const updatedLocalImages = [...localImages];
          updatedLocalImages[index] = newImageData;
          setLocalImages(updatedLocalImages);

          return newImageData;
        }
      }
    }

    throw new Error("Could not process image to remove background");
  } catch (error) {
    console.error("Error removing background:", error);
    
    // 根据错误类型提供不同的用户反馈
    if (error instanceof TypeError) {
      alert("ไม่สามารถประมวลผลภาพได้เนื่องจากข้อมูลภาพไม่ถูกต้อง กรุณาตรวจสอบภาพที่อัปโหลด");
    } else if (error instanceof SyntaxError) {
      alert("มีข้อผิดพลาดในการตีความคำสั่ง กรุณาลองอัปโหลดภาพอีกครั้ง");
    } else {
      alert("เกิดข้อผิดพลาดในการลบพื้นหลังของภาพ กรุณาลองใหม่อีกครั้ง");
    }
  }
};