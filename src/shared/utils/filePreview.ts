import { createSimpleFileStorage } from './simpleFileStorage';

export async function previewCredentialFile(
  walletAddress: string,
  credentialId: string,
  fileName: string,
  fileType: string
): Promise<void> {
  try {
    const walletDbName = `CredentialFiles_${walletAddress}`;
    const fileStorage = await createSimpleFileStorage(walletDbName);
    const fileKey = `credvault_${walletAddress}_file_${credentialId}`;
    const blob = await fileStorage.get(fileKey);

    if (!blob) {
      console.error('File not found in storage');
      alert('File preview is not available.');
      return;
    }

    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;

    if (fileType === 'application/pdf' || fileType.startsWith('image/')) {
      window.open(blobUrl, '_blank');
    } else {
      link.download = fileName || 'credential-file';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 100);
  } catch (error) {
    console.error('Failed to preview credential file:', error);
    alert('Failed to open file preview.');
  }
}