export type Difficulty = 'easy' | 'medium' | 'hard'
export interface SeedQuestion { orderNo: number; text: string; difficulty: Difficulty }

const easy = [
  'I like apples.', 'The dog is big.', 'She has a cat.', 'We can run fast.',
  'It is sunny today.', 'I see a bird.', 'He is my friend.', 'The ball is red.',
  'I love my mom.', 'Look at the moon.',
]
const medium = [
  'The cat is sleeping on the sofa.', 'I want to play with my friends.',
  'My brother is reading a funny book.', 'We are going to the zoo today.',
  'She likes to draw pictures at school.', 'The bird is singing in the tree.',
  'Can I have some milk, please?', 'My father drives a blue car.',
  'We eat breakfast together every morning.', 'The children are playing in the park.',
]
const hard = [
  'Yesterday I went to the park with my best friend.',
  'My sister baked delicious cookies for the whole family.',
  'The students are learning how to swim at school.',
  'When it rains, we stay inside and play games.',
  'My grandmother told me an interesting story last night.',
  'The brave firefighter rescued a small kitten from the tree.',
  'We visited the museum and saw many old paintings.',
  'After dinner, I always brush my teeth before bed.',
  'The beautiful butterfly landed softly on the yellow flower.',
  'Tomorrow we will travel to the beach with our family.',
]

export const QUESTIONS: SeedQuestion[] = [
  ...easy.map((text, i) => ({ orderNo: i + 1, text, difficulty: 'easy' as const })),
  ...medium.map((text, i) => ({ orderNo: i + 11, text, difficulty: 'medium' as const })),
  ...hard.map((text, i) => ({ orderNo: i + 21, text, difficulty: 'hard' as const })),
]
