import rasterio

MOLA = "data/raw/MOLA_463m.tif"

# Test
with rasterio.open(MOLA) as src:
    print(src.crs, '\n')
    print(src.res, '\n')
    print(src.bounds, '\n')
    print(src.width, src.height, src.dtypes, src.nodata, '\n')
    
# convert lat/lon to xy

x = src.res