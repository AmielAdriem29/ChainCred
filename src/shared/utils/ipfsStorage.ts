const BLOCKFROST_IPFS_URL = 'https://ipfs.blockfrost.io/api/v0/ipfs';

export interface IPFSUploadResult {
    cid: string;
    name: string;
    size: number;
    gatewayUrl: string;
}

export async function uploadToIPFS(
    file: File,
    apiKey: string = import.meta.env.VITE_BLOCKFROST_IPFS_KEY ?? '',
): Promise<IPFSUploadResult> {
    if (!apiKey) {
        throw new Error(
            'Blockfrost IPFS API key is missing. ' +
            'Add VITE_BLOCKFROST_IPFS_KEY to your .env file.',
        );
    }

    const formData = new FormData();
    formData.append('file', file, file.name);

    const response = await fetch(`${BLOCKFROST_IPFS_URL}/add`, {
        method: 'POST',
        headers: {
            project_id: apiKey,
        },
        body: formData,
    });

    if (!response.ok) {
        const errorBody = await response.text().catch(() => '(no body)');
        throw new Error(
            `Blockfrost IPFS upload failed: ${response.status} ${response.statusText} — ${errorBody}`,
        );
    }

    const data = (await response.json()) as {
        ipfs_hash: string;
        name: string;
        size: string;
    };

    const cid = data.ipfs_hash;

    return {
        cid,
        name: data.name,
        size: Number(data.size),
        gatewayUrl: `https://ipfs.io/ipfs/${cid}`,
    };
}

export async function pinOnIPFS(
    cid: string,
    apiKey: string = import.meta.env.VITE_BLOCKFROST_IPFS_KEY ?? '',
): Promise<void> {
    if (!apiKey) return;

    const response = await fetch(`${BLOCKFROST_IPFS_URL}/pin/add/${cid}`, {
        method: 'POST',
        headers: { project_id: apiKey },
    });

    if (!response.ok) {
        const errorBody = await response.text().catch(() => '(no body)');
        console.warn(`IPFS pin failed for ${cid}: ${response.status} — ${errorBody}`);
    }
}