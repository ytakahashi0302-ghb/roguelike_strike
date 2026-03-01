from PIL import Image
import glob

def make_white_transparent(image_path):
    try:
        img = Image.open(image_path)
        img = img.convert('RGBA')
        datas = img.getdata()
        
        newData = []
        for item in datas:
            if item[0] > 245 and item[1] > 245 and item[2] > 245:
                # White pixel to transparent
                newData.append((255, 255, 255, 0))
            else:
                newData.append(item)
                
        img.putdata(newData)
        img.save(image_path, 'PNG')
        print(f'Processed {image_path}')
    except Exception as e:
        print(f'Error processing {image_path}: {e}')

for file in glob.glob('c:/Users/green/Documents/workspaces/roguelike_strike/web/public/assets/images/*.png'):
    make_white_transparent(file)
