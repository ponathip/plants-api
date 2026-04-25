import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({ region: process.env.AWS_REGION });

export async function uploadToS3(data, entity, id, checksum) {
  const key = `backup/${entity}/${id}-${Date.now()}.json`;

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET,
      Key: key,
      Body: data,
      ContentType: 'application/json',
      Metadata: { checksum }
    })
  );

  return {
    path: `s3://${process.env.AWS_BUCKET}/${key}`,
    checksum,
    size: data.length
  };
}