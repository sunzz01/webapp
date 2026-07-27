import React, { useState } from 'react';
import { Upload, Button, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';

const HomePage = () => {
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);

  const handleUpload = (info: any) => {
    if (info.file.status === 'done') {
      const reader = new FileReader();
      reader.onload = (e) => {
        setUploadedImage(e.target?.result as string);
      };
      reader.readAsDataURL(info.file.originFileObj);
    }
  };

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* 文本输入框 */}
      <div style={{ width: '300px', marginBottom: '20px', border: '1px solid #d9d9d9', borderRadius: '8px', padding: '16px' }}>
        <p style={{ color: '#666', fontSize: '14px' }}>
          สุรุปงบประมาณ หรือสิ่งที่ต้องการให้ AI เน้นเป็นพิเศษ...
        </p>
      </div>

      {/* 图片上传区域 - 放在按钮上方 */}
      <div style={{ width: '300px', marginBottom: '20px', border: '2px dashed #d9d9d9', borderRadius: '12px', textAlign: 'center', padding: '20px' }}>
        <Upload
          accept=".png,.jpg,.webp"
          beforeUpload={() => false}
          onChange={handleUpload}
          showUploadList={false}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: '50px', height: '50px', backgroundColor: '#f5f5f5', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
              <UploadOutlined style={{ fontSize: '24px', color: '#999' }} />
            </div>
            <p style={{ color: '#666', fontSize: '14px' }}>อัปโหลดภาพ</p>
            <p style={{ color: '#999', fontSize: '12px' }}>รองรับ PNG, JPG, WEBP</p>
          </div>
        </Upload>

        {/* 显示上传的图片 - 放在按钮上方 */}
        {uploadedImage && (
          <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'center' }}>
            <img src={uploadedImage} alt="Uploaded" style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '8px' }} />
          </div>
        )}
      </div>

      {/* 按钮 - 确保不被遮挡 */}
      <Button
        type="primary"
        size="large"
        style={{
          backgroundColor: '#FF7A00',
          borderColor: '#FF7A00',
          width: '100%',
          height: '50px',
          borderRadius: '25px',
          fontSize: '16px',
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
        }}
      >
        <span>เริ่มต้นสร้างภาพด้วย AI</span>
      </Button>
    </div>
  );
};

export default HomePage;