"use client";

import React, { useMemo, useState } from "react";
import { Title, Text } from "rizzui/typography";

import FileUploader from "@/components/form/file-uploader";

export default function FileUploadTemplatePage() {
  const [files, setFiles] = useState<File[]>([]);

  const summary = useMemo(() => {
    if (!files.length) return "ยังไม่ได้เลือกไฟล์";
    return `เลือกแล้ว ${files.length} ไฟล์`;
  }, [files.length]);

  return (
    <div>
      <div>
        <Title as="h1" className="text-lg font-semibold text-gray-900">
          Template: File Upload
        </Title>
        <Text className="mt-1 text-sm text-gray-600">ตัวอย่าง UI แนบไฟล์ (ยังไม่ผูกกับ backend)</Text>
      </div>

      <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-5">
        <FileUploader
          label="แนบไฟล์"
          helperText="คลิกเพื่อเลือกไฟล์ หรือ ลากไฟล์มาวาง"
          hintText={summary}
          files={files}
          onFilesChange={setFiles}
          maxFiles={5}
          maxSizeBytes={10 * 1024 * 1024}
        />
      </div>
    </div>
  );
}

