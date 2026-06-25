type ReadmeProps = {
  readme: string;
};
const Readme: React.FC<ReadmeProps> = ({ readme }) => {
  console.log('Readme:', readme);
  return (
    <section className="w-full h-full p-6 bg-gray-800 rounded-lg shadow-md overflow-auto">
      <div className="max-w-none">
        {/* Main Heading */}
        <h1 className="text-3xl font-bold text-gray-300 mb-4">Awesome Project</h1>
        <p className="text-base text-gray-400 mb-6">
          Lorem ipsum dolor sit amet consectetur adipisicing elit. Ea quas ipsum officiis corporis,
          facere ducimus dolorem sint ad voluptate! Nulla sed expedita et esse quas vitae veritatis
          sequi molestiae id eveniet quo sit alias, consequatur nobis cum dolor nam error
          voluptatem? Officia doloribus suscipit laudantium alias corrupti fuga ad soluta.
        </p>

        {/* Subheading */}
        <h2 className="text-2xl font-semibold text-gray-300 mb-3">Getting Started</h2>
        <p className="text-base text-gray-400 mb-4">
          To set up the project locally, follow these steps:
        </p>
        <pre className="bg-gray-900 p-4 rounded-md overflow-auto mb-6">
          <code className="text-sm font-mono text-gray-400">
            instructions to install the project
            {'\n'}instructions to install the project
            {'\n'}instructions to install the project
          </code>
        </pre>

        {/* Another Subheading */}
        <h2 className="text-2xl font-semibold text-gray-300 mb-3">Usage</h2>
        <p className="text-base text-gray-400 mb-4">
          Lorem ipsum dolor sit, amet consectetur adipisicing elit. Qui soluta ea ab alias beatae,
          debitis enim odit deleniti quisquam vel, commodi natus corporis ex nam voluptas aperiam
          obcaecati explicabo earum! Tenetur laboriosam itaque ex officiis suscipit quos, neque
          vitae deserunt perspiciatis voluptate quam! Consequuntur aspernatur laboriosam veniam?
          Accusantium quibusdam et at recusandae nihil iusto omnis. Illum odio eius dolores aut?
          Accusamus quasi itaque veritatis at ducimus illum sequi, officia voluptate, pariatur
          labore maxime ipsa consequuntur. Consequuntur voluptas, perferendis repudiandae hic
          aspernatur amet.
        </p>
        <pre className="bg-gray-900 p-4 rounded-md overflow-auto mb-6">
          <code className="text-sm font-mono text-gray-400">instructions to run the model</code>
        </pre>

        {/* Optional List */}
        <h2 className="text-2xl font-semibold text-gray-300 mb-3">Features</h2>
        <ul className="list-disc list-inside text-base text-gray-400 space-y-2">
          <li>🔹 Fast refresh with Next.js</li>
          <li>🔹 Styled with Tailwind CSS</li>
          <li>🔹 TypeScript for type safety</li>
          <li>🔹 Markdown-like README styles</li>
        </ul>
      </div>
    </section>
  );
};

export default Readme;
