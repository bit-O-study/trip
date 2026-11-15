type NativeExport = { postMessage: (message: string) => void; onmessage: ((event: { data: string }) => void) | null };
declare global { interface Window { TripFileExport?: NativeExport } }

export async function saveItineraryFile(blob: Blob, filename: string): Promise<string> {
  if (window.TripFileExport) {
    const bridge = window.TripFileExport;
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = () => reject(new Error("파일을 읽지 못했습니다.")); reader.readAsDataURL(blob);
    });
    if (blob.size > 20 * 1024 * 1024) throw new Error("파일이 큽니다. 메모를 빼거나 Day를 선택해 저장해 주세요.");
    return new Promise((resolve, reject) => {
      bridge.onmessage = (event) => {
        try {
          const result = JSON.parse(event.data) as { status: string; message: string };
          bridge.onmessage = null;
          if (result.status === "error") reject(new Error(result.message)); else resolve(result.message);
        } catch { reject(new Error("저장 결과를 확인하지 못했습니다.")); }
      };
      bridge.postMessage(JSON.stringify({ filename, mime: blob.type, data }));
    });
  }
  if (/; wv\)/.test(navigator.userAgent)) throw new Error("앱 업데이트 후 파일을 저장할 수 있습니다. 웹브라우저에서도 다운로드할 수 있습니다.");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "파일을 만들었습니다. 브라우저의 다운로드 목록에서 확인해 주세요.";
}
