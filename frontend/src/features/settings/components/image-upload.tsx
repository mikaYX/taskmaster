import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Upload, X, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ImageUploadProps {
    value?: string;
    onChange: (url: string) => void;
    onUpload: (file: File) => Promise<string>;
    label?: string;
    className?: string;
    accept?: string;
}

export function ImageUpload({
    value,
    onChange,
    onUpload,
    label,
    className,
    accept = "image/png, image/jpeg, image/svg+xml, image/x-icon"
}: ImageUploadProps) {
    const [isUploading, setIsUploading] = useState(false);
    const [preview, setPreview] = useState(value);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Local preview
        const objectUrl = URL.createObjectURL(file);
        setPreview(objectUrl);
        setIsUploading(true);

        try {
            const uploadedUrl = await onUpload(file);
            onChange(uploadedUrl);
            setPreview(uploadedUrl);
            toast.success('Image uploaded successfully');
        } catch (error) {
            console.error('Upload failed:', error);
            toast.error('Failed to upload image');
            // Revert preview
            setPreview(value);
        } finally {
            setIsUploading(false);
            // Reset input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleRemove = () => {
        onChange('');
        setPreview('');
    };

    return (
        <div className={cn("space-y-2", className)}>
            {label && <span className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">{label}</span>}

            <div className="flex items-start gap-4">
                <div className={cn(
                    "relative flex h-24 w-24 shrink-0 items-center justify-center rounded-md border border-dashed",
                    !preview && "bg-muted"
                )}>
                    {isUploading ? (
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    ) : preview ? (
                        <img
                            src={preview}
                            alt="Preview"
                            className="h-full w-full rounded-md object-contain p-1"
                        />
                    ) : (
                        <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
                    )}

                    {preview && !isUploading && (
                        <button
                            type="button"
                            onClick={handleRemove}
                            className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90"
                        >
                            <X className="h-3 w-3" />
                            <span className="sr-only">Remove</span>
                        </button>
                    )}
                </div>

                <div className="space-y-2">
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept={accept}
                        className="hidden"
                    />
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isUploading}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <Upload className="mr-2 h-4 w-4" />
                        Upload Image
                    </Button>
                    <p className="text-[0.8rem] text-muted-foreground">
                        Recommended: PNG, JPG, or SVG. Max 2MB.
                    </p>
                </div>
            </div>
        </div>
    );
}
