
import React, { useCallback, useRef, useState } from 'react';

interface ImageUploadProps {
    onImageSelected: (base64: string) => void;
}

const ImageUpload: React.FC<ImageUploadProps> = ({ onImageSelected }) => {
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
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

    const startCamera = async (mode: 'user' | 'environment' = 'user') => {
        try {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }

            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode } });
            streamRef.current = stream;
            setFacingMode(mode);
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

    const switchCamera = () => {
        startCamera(facingMode === 'user' ? 'environment' : 'user');
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
                // Mirror the canvas context if it's the front camera so the resulting saved
                // photo matches what the user saw on their screen.
                if (facingMode === 'user') {
                    ctx.translate(canvas.width, 0);
                    ctx.scale(-1, 1);
                }
                ctx.drawImage(videoRef.current, 0, 0);
                const dataUrl = canvas.toDataURL('image/jpeg');
                stopCamera();
                onImageSelected(dataUrl);
            }
        }
    };

    return (
        <div className="w-full max-w-md mx-auto">
            {isCameraOpen ? (
                <div className="relative rounded-xl overflow-hidden border-2 border-yellow-500 bg-black shadow-2xl">
                    <div className="absolute top-4 right-4 z-10 flex gap-2">
                        <button
                            onClick={switchCamera}
                            className="bg-neutral-800/80 text-white p-2 rounded-full text-xl hover:bg-neutral-700 transition shadow-lg"
                            title="Flip Camera"
                        >
                            🔄
                        </button>
                    </div>
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className={`w-full h-64 object-cover ${facingMode === 'user' ? 'transform scale-x-[-1]' : ''}`}
                    />
                    <div className="absolute bottom-4 left-0 right-0 flex justify-center space-x-4">
                        <button
                            onClick={stopCamera}
                            className="px-4 py-2 bg-neutral-800/80 text-white rounded-full text-sm font-semibold hover:bg-neutral-700 transition"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={capturePhoto}
                            className="px-6 py-2 bg-red-600 text-white rounded-full font-bold hover:bg-red-500 transition shadow-lg animate-pulse"
                        >
                            SNAP IT 📸
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-xl bg-neutral-900 border-neutral-700 hover:border-yellow-500 hover:bg-neutral-800 transition-all group relative">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center p-4 w-full">
                        <label className="cursor-pointer flex flex-col items-center justify-center">
                            <div className="mb-4 text-neutral-500 group-hover:text-yellow-500 transition-colors">
                                <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                                </svg>
                            </div>
                            <p className="mb-2 text-xl font-comic text-neutral-300">
                                <span className="text-yellow-500">Click to upload photo</span>
                            </p>
                            <p className="text-sm text-neutral-500">From Photo Library</p>
                            <input
                                type="file"
                                className="hidden"
                                accept="image/png, image/jpeg, image/jpg"
                                onChange={handleFileChange}
                            />
                        </label>

                        <div className="flex items-center w-full mt-6 space-x-2">
                            <div className="h-px bg-neutral-700 flex-1"></div>
                            <span className="text-xs text-neutral-500 font-bold">OR</span>
                            <div className="h-px bg-neutral-700 flex-1"></div>
                        </div>

                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                startCamera('user');
                            }}
                            className="mt-4 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-yellow-500 text-sm font-bold rounded-lg transition-colors border border-neutral-600 hover:border-yellow-500 flex items-center space-x-2"
                        >
                            <span>📷 Open Device Camera</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ImageUpload;
