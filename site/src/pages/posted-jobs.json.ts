import { generatedAt, jobs } from '../data';

/** Feed public des annonces postées — miroir JSON pour machines / SEO tools. */
export async function GET() {
  return new Response(
    `${JSON.stringify({ generatedAt, jobs }, null, 2)}\n`,
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    },
  );
}
