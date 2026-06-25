import Image from 'next/image';
import Link from 'next/link';
import React from 'react';

const HomePage: React.FC = () => {
  return (
    <main className="min-h-screen bg-[#0d1117] text-gray-200 flex flex-col items-center p-8">
      {/* Logo placeholder */}
      <div className="my-16 h-60 w-120">
        {/* Replace with your logo */}
        <Image
          className="rounded-full h-full w-full"
          src="/full-logo.jpeg"
          alt="Flair Logo"
          width={500}
          height={300}
        />
      </div>

      {/* Heading */}
      <h1 className="text-4xl font-bold text-white mb-2 text-center">
        Flair – Privacy-Preserving ML Collaboration
      </h1>
      <p className="max-w-3xl text-center mb-12">
        Train machine learning models together without ever sharing your private data.
      </p>

      {/* 3-Column Feature Grid */}
      <section className="max-w-6xl w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
        {/* Why Flair */}
        <div>
          <h2 className="text-2xl font-semibold text-white mb-4">🔒 Why Flair?</h2>
          <ul className="list-disc list-inside space-y-2 text-gray-300">
            <li>
              <strong>Your Data Stays Private</strong> – The model trains on your device, and only
              updates (not your data) are shared.
            </li>
            <li>
              <strong>Verifiable Training</strong> – Others can verify that your training is legit
              without seeing any details.
            </li>
            <li>
              <strong>Full Ownership</strong> – Every commit you make is recorded as an NFT, proving
              your intellectual work.
            </li>
            <li>
              <strong>Access Control</strong> – Only authorized people can access model details,
              ensuring total security.
            </li>
          </ul>
        </div>

        {/* How It Works */}
        <div>
          <h2 className="text-2xl font-semibold text-white mb-4">🛠 How It Works</h2>
          <ol className="list-decimal list-inside space-y-2 text-gray-300">
            <li>Upload a model – Start by creating a new ML model repository.</li>
            <li>
              Invite trusted collaborators – Just like GitHub, invite contributors to train the
              model.
            </li>
            <li>
              Train Locally – Models are trained on personal devices—your data never leaves your
              system.
            </li>
            <li>
              Share Updates, Not Data – Only model updates (not the actual data) are shared and
              merged.
            </li>
            <li>
              Verify with Zero-Knowledge Proofs – Contributions are checked for authenticity without
              exposing any data.
            </li>
            <li>
              Own Your Work – Every update is stored as an NFT, ensuring proof of contribution.
            </li>
          </ol>
        </div>

        {/* Supported Framework & ZKPs */}
        <div>
          <h2 className="text-2xl font-semibold text-white mb-4">
            🔗 Framework & 🔐 Zero-Knowledge Proofs
          </h2>
          <p className="text-gray-300 mb-4">
            Supported Framework: <strong>PyTorch</strong>
          </p>
          <p className="text-gray-300 mb-2">
            A Zero-Knowledge Proof (ZKP) lets a contributor prove that they’ve trained a machine
            learning model on their private data without actually revealing the data.
          </p>
          <ul className="list-disc list-inside space-y-2 text-gray-300">
            <li>Your updates are verified as legit, but no one can see your data.</li>
            <li>Prevents fraud—ensures real contributions without revealing secrets.</li>
            <li>Privacy first – Keeps all training data hidden from others.</li>
          </ul>
        </div>
      </section>

      {/* Call to action */}
      <section className="flex gap-4 mt-12">
        <Link
          href={'/downloads/flaircli'}
          className="bg-gray-800 hover:bg-gray-800 text-white font-semibold px-6 py-3 rounded-lg transition"
        >
          Download Flair CLI
        </Link>{' '}
        <Link
          href={'/docs'}
          className="bg-gray-800 hover:bg-gray-800 text-white font-semibold px-6 py-3 rounded-lg transition"
        >
          Documentations
        </Link>{' '}
        <Link
          href={'/login'}
          className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-3 rounded-lg transition"
        >
          🚀 Get Started
        </Link>
      </section>
    </main>
  );
};

export default HomePage;
