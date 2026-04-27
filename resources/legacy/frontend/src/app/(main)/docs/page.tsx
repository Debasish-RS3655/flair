'use client';
import { Check, Copy } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

// components/Page.tsx
const Page: React.FC = () => {
  return (
    <div className="bg-black text-white flex gap-4 min-h-screen font-sans">
      <main className="flex-grow flex flex-col gap-8 pl-96 pr-20 py-16">
        <h1 className="text-4xl font-bold" id="flair-cli-docs">
          Flair CLI Documentations
        </h1>
        <h2 className="text-lg ml-4">
          Download the Flair CLI{' '}
          <Link href="/downloads/flaircli" className="text-blue-500">
            here
          </Link>
          .
        </h2>
        <Section
          title="Version Check"
          id="version-check"
          command="flair -v | --version"
          usage="flair --version"
          description="Display the installed Flair CLI version."
        />

        <Section
          title="Initialize Project"
          id="initialize-project"
          command="flair up"
          description="Link your local directory to a FlairHub repository. Prompts Solana wallet authentication and repository hash, then creates a hidden .flair/ folder to track commits."
          usage="flair up"
        />

        <Section
          title="Upload Base Model"
          id="upload-base-model"
          command="flair upload-base -p <path>"
          description="Upload the initial model weights into the Flair repository before any training."
          flags={[
            {
              flag: '-p <path>',
              description: 'Path to the base model file (.h5) relative to your project root.',
            },
          ]}
          usage="flair upload-base -p models/base_model.h5"
        />

        <h2 className="text-3xl font-semibold" id="branch-management">
          Branch Management
        </h2>
        <div className="px-4 flex flex-col gap-4">
          <Section
            title="Show Current Branch"
            id="show-current-branch"
            command="flair branch"
            description="Display the active branch name."
            usage="flair branch"
          />
          <Section
            title="List All Branches"
            id="list-branches"
            command="flair branch -l | --list"
            description="List all existing branches in the repository."
            usage="flair branch --list"
          />
          <Section
            title="Create a New Branch"
            id="create-branch"
            command="flair create <branch-name>"
            description="Create and switch to a new branch."
            usage="flair create experimental"
          />
          <Section
            title="Switch Branch"
            id="switch-branch"
            command="flair hop <branch-name>"
            description="Switch to the specified branch."
            usage="flair hop main"
          />
        </div>

        <h2 className="text-3xl font-semibold" id="training-and-commits">
          Training & Commits
        </h2>
        <div className="px-4 flex flex-col gap-4">
          <Section
            title="Run Training (burn)"
            id="run-training"
            command={`flair burn \\
  -p <model-path> \\
  -m <model-name> \\
  -a <data-path> \\
  -i <data-name> \\
  -d "<description>"`}
            flags={[
              {
                flag: '-p, --path',
                description:
                  'Relative path under .flair/ to the module containing your model code.',
              },
              {
                flag: '-m, --model',
                description: 'Identifier for your model instance.',
              },
              {
                flag: '-a, --data-path',
                description: 'Relative path to your dataset under .flair/.',
              },
              {
                flag: '-i, --data-instance',
                description: 'Identifier for your dataset instance.',
              },
              {
                flag: '-d, --description',
                description: 'Short message describing this training run.',
              },
            ]}
            description="Execute a local training session, generate a zkML proof verifying the training, and record a new commit that includes the proof."
            usage={`flair burn -p models/classifier -m convNet \\
  -a data/mnist -i mnist_train \\
  -d "Initial MNIST training run"`}
          />
          <Section
            title="View Commit Timeline"
            id="view-timeline"
            command="flair timeline"
            description="Show a history of all burn commits on the current branch, including commit hashes, descriptions, and timestamps."
            usage="flair timeline"
          />
        </div>

        <h2 className="text-3xl font-semibold" id="nft-collection-minting">
          NFT Collection & Minting
        </h2>
        <div className="px-4 flex flex-col gap-4">
          <Section
            title="Create NFT Collection"
            id="create-collection"
            command="flair create-collection"
            description="Initialize a Solana NFT collection linked to your model repository. All subsequent commit NFTs belong to this collection."
            usage="flair create-collection"
          />
          <Section
            title="Mint Commit as cNFT"
            id="mint-cNFT"
            command="flair create-nft <commit-hash>"
            parameters={[
              {
                parameter: '<commit-hash>',
                description: 'The hash of an existing burn commit.',
              },
            ]}
            description="Mint the specified commit as a Solana compressed NFT within your collection, establishing on-chain ownership."
            usage="flair create-nft a1b2c3d4"
          />
        </div>
      </main>

      {/* Sidebar */}
      <aside className="w-80 fixed left-0 top-0 pt-20 pl-12 pr-4 h-full overflow-y-auto bg-zinc-900 border-r border-gray-700">
        <h2 className="text-2xl font-semibold mb-4">Quick Links</h2>
        <ul className="space-y-2 flex flex-col gap-1 text-base">
          <li>
            <a href="#version-check" className="text-blue-400 hover:underline">
              Version Check
            </a>
          </li>
          <li>
            <a href="#initialize-project" className="text-blue-400 hover:underline">
              Initialize Project
            </a>
          </li>
          <li>
            <a href="#upload-base-model" className="text-blue-400 hover:underline">
              Upload Base Model
            </a>
          </li>
          <li>
            <a href="#branch-management" className="text-blue-400 hover:underline">
              Branch Management
            </a>
          </li>
          <ul className="pl-4 space-y-1">
            <li>
              <a href="#show-current-branch" className="text-blue-300 hover:underline">
                Show Current Branch
              </a>
            </li>
            <li>
              <a href="#list-branches" className="text-blue-300 hover:underline">
                List All Branches
              </a>
            </li>
            <li>
              <a href="#create-branch" className="text-blue-300 hover:underline">
                Create Branch
              </a>
            </li>
            <li>
              <a href="#switch-branch" className="text-blue-300 hover:underline">
                Switch Branch
              </a>
            </li>
          </ul>
          <li>
            <a href="#training-and-commits" className="text-blue-400 hover:underline">
              Training & Commits
            </a>
          </li>
          <ul className="pl-4 space-y-1">
            <li>
              <a href="#run-training" className="text-blue-300 hover:underline">
                Run Training
              </a>
            </li>
            <li>
              <a href="#view-timeline" className="text-blue-300 hover:underline">
                View Timeline
              </a>
            </li>
          </ul>
          <li>
            <a href="#nft-collection-minting" className="text-blue-400 hover:underline">
              NFT Collection & Minting
            </a>
          </li>
          <ul className="pl-4 space-y-1">
            <li>
              <a href="#create-collection" className="text-blue-300 hover:underline">
                Create Collection
              </a>
            </li>
            <li>
              <a href="#mint-cNFT" className="text-blue-300 hover:underline">
                Mint Commit as cNFT
              </a>
            </li>
          </ul>
        </ul>
      </aside>
    </div>
  );
};

export default Page;

const Section = ({
  id,
  title,
  command,
  usage,
  description,
  flags,
  parameters,
}: {
  id: string;
  title: string;
  command: string;
  usage: string;
  description: string;
  flags?: {
    flag: string;
    description: string;
  }[];
  parameters?: {
    parameter: string;
    description: string;
  }[];
}) => {
  return (
    <section id={id} className="flex flex-col gap-2 p-6 ">
      <h2 className="text-3xl mb-2">
        <strong>{title}</strong>
      </h2>
      <div className="flex flex-col gap-2 px-6">
        <Command label="Command" value={command} />
        {parameters && parameters.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-lg font-semibold">
              <b>Parameters</b>
            </h3>
            {parameters.map((parameter, index) => (
              <div key={index} className="flex items-center gap-1">
                <code className="bg-gray-800 py-1 px-2 rounded-md">{parameter.parameter}</code>
                <p className="text-white">
                  <b>: {parameter.description}</b>
                </p>
              </div>
            ))}
          </div>
        )}
        {flags && flags.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-lg font-semibold">
              <b>Flags</b>
            </h3>
            {flags.map((flag, index) => (
              <div key={index} className="flex items-center gap-1">
                <code className="bg-gray-800 py-1 px-2 rounded-md">{flag.flag}</code>
                <p className="text-white">
                  <b>: {flag.description}</b>
                </p>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-lg text-white">
          <b>Purpose: </b>
          {description}
        </p>
        <Command label="Usage" value={usage} />
      </div>
    </section>
  );
};

const Command = ({ label, value }: { label: string; value: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2 w-full">
      <p>
        <b>{label ?? 'Command'} : </b>{' '}
      </p>
      <code className="flex items-center gap-2 justify-between bg-gray-800 py-2 text-base px-4 w-full rounded-xl">
        {value}

        <button
          onClick={() => {
            setCopied(true);
            navigator.clipboard.writeText(value);
            setTimeout(() => setCopied(false), 800);
            // toast('Command copied to clipboard!');
          }}
        >
          {copied ? <Check strokeWidth={2} size={20} /> : <Copy size={20} />}
        </button>
      </code>
    </div>
  );
};
