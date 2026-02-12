import React, { useCallback, useRef, useState } from 'react';

interface ImageUploadProps {
    onImageSelected: (base64: string) => void;
}

const ImageUpload: React.FC<ImageUploadProps> = ({ onImageSelected }) => {
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                onImageSelected(result);
            };
            reader.readAsDataURL(file);
        }
    }, [onImageSelected]);

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
            streamRef.current = stream;
            setIsCameraOpen(true);
            // Wait for state update then attach stream
            setTimeout(() => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
            }, 100);
        } catch (err) {
            console.error("Error accessing camera:", err);
            alert("Could not access camera. Please allow permissions.");
        }
    };

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setIsCameraOpen(false);
    };

    const capturePhoto = () => {
        if (videoRef.current) {
            const canvas = document.createElement('canvas');
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(videoRef.current, 0, 0);
                const dataUrl = canvas.toDataURL('image/jpeg');
                stopCamera();
                onImageSelected(dataUrl);
            }
        }
    };

    return (
        <div className="w-full max-w-sm mx-auto">
            {isCameraOpen ? (
                <div className="relative rounded-2xl overflow-hidden border-2 border-party-accent bg-black shadow-2xl">
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-80 object-cover transform scale-x-[-1]"
                    />
                    <div className="absolute bottom-6 left-0 right-0 flex justify-center space-x-4">
                        <button
                            onClick={stopCamera}
                            className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-all"
                        >
                            ✕
                        </button>
                        <button
                            onClick={capturePhoto}
                            className="w-16 h-16 rounded-full bg-red-500 border-4 border-white/20 flex items-center justify-center text-white shadow-lg hover:scale-105 active:scale-95 transition-all"
                        >
                            <div className="w-6 h-6 bg-white rounded-full"></div>
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            startCamera();
                        }}
                        className="w-full py-4 bg-party-accent hover:bg-yellow-400 text-slate-900 font-bold rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
                    >
                        <span className="text-xl">📷</span>
                        <span>Take Selfie</span>
                    </button>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
                        <div className="relative flex justify-center text-xs uppercase"><span className="bg-[#0f0f0f] px-2 text-neutral-500">Or upload</span></div>
                    </div>

                    <label className="cursor-pointer">
                        <div className="w-full py-3 bg-white/5 hover:bg-white/10 text-neutral-300 font-medium rounded-xl border border-white/10 transition-all active:scale-95 flex items-center justify-center gap-2">
                            <span>📂 Choose Image</span>
                        </div>
                        <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={handleFileChange}
                        />
                    </label>
                </div>
            )}
        </div>
    );
};

export default ImageUpload;
