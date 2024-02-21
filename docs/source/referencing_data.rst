================
Referencing Data
================

The data in the `data` attribute of a `Dataset` object is a `DataArray` object. This is a multi-dimensional array with labeled dimensions and coordinates. The `DataArray` object has a `coords` attribute that contains the coordinates of the array. The `coords` attribute is a dictionary-like object that maps coordinate names to arrays of coordinate values. The `coords` attribute also has a `dims` attribute that contains the names of the dimensions of the array.
