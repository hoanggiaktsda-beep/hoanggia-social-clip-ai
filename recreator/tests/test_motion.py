import unittest
from recreator.motion_analyzer import scene_boundaries, build_scenes

class MotionTests(unittest.TestCase):
    def test_cut_detection(self):
        samples=[(0,[1,0,0]),(.4,[.95,.05,0]),(1.0,[0,1,0]),(1.3,[0,1,0])]
        self.assertEqual(scene_boundaries(samples,threshold=.48),[1.0])
    def test_min_gap(self):
        samples=[(0,[1,0]),(1,[0,1]),(1.2,[1,0])]
        self.assertEqual(scene_boundaries(samples,min_gap=.8),[1])
    def test_storyboard(self):
        scenes=build_scenes(5,[2,4])
        self.assertEqual(len(scenes),3)
        self.assertEqual(sum(s["duration"] for s in scenes),5)
    def test_invalid_boundaries(self):
        self.assertEqual(build_scenes(2,[0,2,3]),[{"scene_id":1,"start":0.0,"end":2,"duration":2.0}])

if __name__=="__main__":unittest.main()
