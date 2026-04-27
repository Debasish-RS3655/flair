const Page: React.FC = () => {
  return (
    <section>
      <div className="flex flex-col gap-4 items-center justify-center min-h-screen bg-gray-900 px-40">
        <h1 className="text-5xl font-bold mb-4">FlairCLI Download</h1>
        <p className="mb-4 text-center mx-40 text-lg">
          The Flair CLI empowers developers to manage privacy-preserving ML workflows on Solana with
          Git-like commands. You can initialize projects, version model weights, run local training
          with zkML proofs, and mint Solana compressed NFTs for each training commit.
        </p>
        <h2 className="mb-2 text-lg">Download the latest version of FlairCLI from the link :</h2>
        <p>
          {' '}
          <a
            className="text-blue-500"
            href="https://github.com/swagatmitra-b/flair/releases/download/cli/flair"
            target="_blank"
            rel="noopener"
          >
            {' '}
            flair{' '}
          </a>
        </p>
        <p>
          {' '}
          <a
            className="text-blue-500"
            href="https://github.com/swagatmitra-b/flair/releases/download/cli/flair.exe"
            target="_blank"
            rel="noopener"
          >
            {' '}
            flair.exe{' '}
          </a>
        </p>
        <p>
          {' '}
          <a
            className="text-blue-500"
            href="https://github.com/swagatmitra-b/flair/archive/refs/tags/cli.zip"
            target="_blank"
            rel="noopener"
          >
            {' '}
            Source code (zip){' '}
          </a>
        </p>
        <p>
          {' '}
          <a
            className="text-blue-500"
            href="https://github.com/swagatmitra-b/flair/archive/refs/tags/cli.tar.gz"
            target="_blank"
            rel="noopener"
          >
            {' '}
            Source code (tar.gz){' '}
          </a>
        </p>
        <b className="mt-2">
          Add the flair.exe (windows) and flair (linux) to path (environment variables) before
          runnig flair
        </b>
      </div>
    </section>
  );
};

export default Page;
