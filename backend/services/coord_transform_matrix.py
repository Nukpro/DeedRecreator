import math
import numpy as np  # type: ignore[import]

class CoordTransformMaatrix():
    
    def __init__(self, rotation_angle, scale_factor, image_base_point, delta_x, delta_y):
        self.rotation_angle = rotation_angle # degrees, positive - clockwise
        self.scale_factor = scale_factor # directly proportion to the change image size
        self.image_base_point = image_base_point # [x, y] - in image CRS
        self.delta_xy = [delta_x, delta_y] # [delta_x, delta_y] - in image CRS
        self.sin_angle = math.sin(math.radians(rotation_angle))
        self.cos_angle = math.cos(math.radians(rotation_angle))
        self.transform_matrix = None
        self.store_matrix()

    def store_matrix(self):
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
    
    def returt_matrix_coefs(self):
        pass

    def return_image_coords(self, drawing_coor_x, drawing_coord_y):
        if self.transform_matrix is None:
            raise ValueError("Transform matrix not initialized. Call store_matrix() first.")
        provided_coords = np.array([[drawing_coor_x],[drawing_coord_y],[1]])
        calc_values_matrix = np.dot(self.transform_matrix, provided_coords)
        calc_values = [float(calc_values_matrix[0,0]), float(calc_values_matrix[1,0])]
        return(calc_values)


### test

matr = CoordTransformMaatrix(-28.853, 0.6, [1.5921, 3.2349], 15, 8)

print(matr.return_image_coords(20.8673, 13.5138))


