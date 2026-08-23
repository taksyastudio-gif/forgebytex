export type NebProgram = {
  id: string;
  title: string;
  language: 'c' | 'html';
  content: string;
  topic?: string;
};

// A starter subset of the NEB Grade 12 curriculum programs.
// Expand to 100 programs as needed; this file provides the
// structure and initial examples used by the modal and tests.

export const nebPrograms: NebProgram[] = [
  {
    id: 'c-io-hello',
    title: 'C: Hello forgebyteX (Basic I/O)',
    language: 'c',
    topic: 'Basic I/O',
    content: `#include <stdio.h>

int main() {
    printf("Hello forgebyteX!\\n");
    return 0;
}`,
  },
  {
    id: 'c-sum-array',
    title: 'C: Sum of 1D Array',
    language: 'c',
    topic: 'Arrays',
    content: `#include <stdio.h>

int main() {
    int a[] = {1,2,3,4,5};
    int sum = 0;
    for(int i=0;i<5;i++) sum += a[i];
    printf("Sum = %d\\n", sum);
    return 0;
}`,
  },
  {
    id: 'html-basics',
    title: 'HTML: Basic Page (Headings & Paragraphs)',
    language: 'html',
    topic: 'HTML Tags',
    content: `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>forgebyteX HTML Sample</title>
  </head>
  <body>
    <h1>Welcome to forgebyteX</h1>
    <p>This is an NEB Grade 12 HTML example.</p>
  </body>
</html>`,
  },
  {
    id: 'html-form',
    title: 'HTML: Simple Form (Text + Submit)',
    language: 'html',
    topic: 'Forms',
    content: `<!doctype html>
<html>
  <body>
    <form>
      <label>Name: <input type="text" name="name" /></label>
      <button type="submit">Submit</button>
    </form>
  </body>
</html>`,
  },
];

export default nebPrograms;
