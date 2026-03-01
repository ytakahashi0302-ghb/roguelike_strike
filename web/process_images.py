import sys

def remove_bg_and_crop(input_path, output_path, size=(64, 64)):
    try:
        from PIL import Image, ImageChops
    except ImportError:
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow"])
        from PIL import Image, ImageChops

    try:
        img = Image.open(input_path).convert("RGBA")
        
        # Get background color from top-left pixel
        bg_color = img.getpixel((0,0))
        
        # Create a boolean mask where true = different from bg
        bg = Image.new("RGBA", img.size, bg_color)
        diff = ImageChops.difference(img, bg)
        # Convert to grayscale to evaluate difference easily
        diff = diff.convert("L")
        
        # Any difference > 15 is considered foreground
        mask = diff.point(lambda p: 255 if p > 15 else 0)
        
        # Apply mask
        img.putalpha(mask)
        
        # Crop to bounding box of the non-transparent pixels
        bbox = mask.getbbox()
        if bbox:
            img = img.crop(bbox)
        
        # Resize to fill the target size maintaining aspect ratio
        img.thumbnail(size, Image.Resampling.LANCZOS)
        
        # Create a transparent background canvas
        final_img = Image.new("RGBA", size, (255, 255, 255, 0))
        
        # Paste centered
        # Ensure coordinates are integers
        offset_x = int((size[0] - img.width) / 2)
        offset_y = int((size[1] - img.height) / 2)
        final_img.paste(img, (offset_x, offset_y), img)
        
        final_img.save(output_path)
        print(f"Processed {input_path} -> {output_path}")
    except Exception as e:
        print(f"Error processing {input_path}: {e}")

if __name__ == "__main__":
    import glob
    import os
    
    # Process new players
    artifact_dir = r"C:\Users\green\.gemini\antigravity\brain\3a64531c-e89f-4a46-9dd7-4d7c27b7e9ae"
    dest_dir = "public/assets/images"
    
    player_types = ['bounce', 'pierce', 'split', 'heavy', 'blast']
    for p_type in player_types:
        matches = glob.glob(os.path.join(artifact_dir, f"player_{p_type}_girl_*.png"))
        if matches:
            latest = sorted(matches)[-1]  # Get most recent if multiple
            remove_bg_and_crop(latest, os.path.join(dest_dir, f"player_{p_type}.png"), size=(80, 80)) # make them 80x80 to fill 64x64/80x80 space max

    # Process background
    bg_matches = glob.glob(os.path.join(artifact_dir, "bg_stage_fantasy_*.png"))
    if bg_matches:
        import shutil
        latest_bg = sorted(bg_matches)[-1]
        shutil.copy(latest_bg, os.path.join(dest_dir, "bg_stage.png"))
        print(f"Copied {latest_bg} -> {os.path.join(dest_dir, 'bg_stage.png')}")
