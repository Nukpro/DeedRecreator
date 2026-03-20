import math
import numpy as np  # type: ignore[import]

_PARAMS_KEYS = frozenset({"rotation_angle", "scale_factor", "image_base_point", "delta_x", "delta_y"})
_COEFS_KEYS = frozenset({"a", "b", "c", "d", "e", "f"})


class CoordTransformMaatrix():

    def __init__(self, **kwargs):
        self.rotation_angle = None
        self.scale_factor = None
        self.image_base_point = None
        self.delta_xy = None
        self.sin_angle = None
        self.cos_angle = None
        self.transform_matrix = None
        self._init_from_kwargs(**kwargs)

    def _init_from_kwargs(self, **kwargs):
        given = frozenset(kwargs.keys())
        if given == _PARAMS_KEYS:
            self.rotation_angle = kwargs["rotation_angle"]
            self.scale_factor = kwargs["scale_factor"]
            self.image_base_point = kwargs["image_base_point"]
            self.delta_xy = [kwargs["delta_x"], kwargs["delta_y"]]
            self.sin_angle = math.sin(math.radians(self.rotation_angle))
            self.cos_angle = math.cos(math.radians(self.rotation_angle))
            self.store_matrix()
            return
        if given == _COEFS_KEYS:
            self.parse_stored_matrix(
                kwargs["a"], kwargs["b"], kwargs["c"],
                kwargs["d"], kwargs["e"], kwargs["f"]
            )
            return
        if given and given.issubset(_PARAMS_KEYS):
            missing = sorted(_PARAMS_KEYS - given)
            raise ValueError(f"Missing parameters: {missing}")
        if given and given.issubset(_COEFS_KEYS):
            missing = sorted(_COEFS_KEYS - given)
            raise ValueError(f"Missing matrix coefficients: {missing}")
        if given & _PARAMS_KEYS and given & _COEFS_KEYS:
            raise ValueError(
                "Invalid kwargs: cannot mix parameter set (rotation_angle, scale_factor, ...) "
                "with coefficient set (a, b, c, d, e, f)."
            )
        if not given:
            raise ValueError(
                "Missing kwargs: provide either (rotation_angle, scale_factor, image_base_point, delta_x, delta_y) "
                "or (a, b, c, d, e, f)."
            )
        unexpected = sorted(given - _PARAMS_KEYS - _COEFS_KEYS)
        raise ValueError(f"Unexpected kwargs: {unexpected}. Expected either {set(_PARAMS_KEYS)} or {set(_COEFS_KEYS)}.")

    def store_matrix(self):
        assert self.rotation_angle is not None and self.scale_factor is not None
        assert self.image_base_point is not None and self.delta_xy is not None
        assert self.cos_angle is not None and self.sin_angle is not None
        self.A = self.cos_angle / self.scale_factor
        self.B = self.sin_angle / self.scale_factor
        self.C = (
            self.image_base_point[0]
            - 1 / self.scale_factor
            * (
                self.cos_angle * (self.image_base_point[0] + self.delta_xy[0])
                + self.sin_angle * (self.image_base_point[1] + self.delta_xy[1])
            )
        )
        self.D = - self.sin_angle / self.scale_factor
        self.E = self.cos_angle / self.scale_factor
        self.F = (
            self.image_base_point[1]
            - 1 / self.scale_factor
            * (
                -self.sin_angle * (self.image_base_point[0] + self.delta_xy[0])
                + self.cos_angle * (self.image_base_point[1] + self.delta_xy[1])
            )
        )
        self.transform_matrix = np.array([
            [self.A, self.B, self.C],
            [self.D, self.E, self.F],
            [0,0,1]]
        )
    
    def parse_stored_matrix(self, a, b, c, d, e, f):
            self.transform_matrix = np.array([
            [a, b, c],
            [d, e, f],
            [0,0,1]])
    
    def return_matrix_coefs(self):
        if self.transform_matrix is None:
            raise ValueError("Transform matrix not initialized.")
        return {
            "a": float(self.transform_matrix[0, 0]),
            "b": float(self.transform_matrix[0, 1]),
            "c": float(self.transform_matrix[0, 2]),
            "d": float(self.transform_matrix[1, 0]),
            "e": float(self.transform_matrix[1, 1]),
            "f": float(self.transform_matrix[1, 2]),
        }

    def return_image_coords(self, drawing_coor_x, drawing_coord_y):
        if self.transform_matrix is None:
            raise ValueError("Transform matrix not initialized. Call store_matrix() first.")
        provided_coords = np.array([[drawing_coor_x],[drawing_coord_y],[1]])
        calc_values_matrix = np.dot(self.transform_matrix, provided_coords)
        calc_values = [float(calc_values_matrix[0,0]), float(calc_values_matrix[1,0])]
        return(calc_values)


### test

matr = CoordTransformMaatrix(
    rotation_angle=-28.853,
    scale_factor=0.6,
    image_base_point=[1.5921, 3.2349],
    delta_x=15,
    delta_y=8,
)
print(matr.return_image_coords(20.8673, 13.5138))
print(matr.return_matrix_coefs())


