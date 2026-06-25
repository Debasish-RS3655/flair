'use client';

import { request } from '@/lib/requests';
import { useRouter } from 'next/navigation';
import React, { useState } from 'react';
import { toast } from 'react-toastify';

const Page: React.FC = () => {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    usecase: '',
    frameworks: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };
  // working
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    console.log('Form Submitted:', formData);
    try {
      const response = await request({
        method: 'POST',
        url: `${process.env.NEXT_PUBLIC_API_URL}/repo/create`,
        data: JSON.stringify({
          name: formData.name,
          metadata: {
            name: formData.name,
            description: formData.description,
            useCase: formData.usecase,
            framework: formData.frameworks,
          },
        }),
        action: 'signin',
      });
      const data = await response.json();
      console.log('Response:', data);
      if (data.data) {
        toast.success('Repository created successfully');
        router.push(`/repository/${data.data.repoHash}`);
      } else if (data.error) {
        toast.error(data.error.message);
      }
    } catch (err) {
      toast.error('Error creating repository');
      console.log('repo creation error', err);
    }
  };

  return (
    <section className="min-h-screen bg-[#0d1117] text-gray-200 px-4 sm:px-6 py-32">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-semibold mb-1 text-white">Create a New Repository</h1>
        <p className="text-xs text-gray-400 mb-8">
          A repository contains all project files, including the revision history. Already have a
          project repository elsewhere?
        </p>

        <form className="space-y-6" onSubmit={handleSubmit}>
          {/* Name */}
          <div>
            <label htmlFor="name" className="block text-sm mb-1 text-gray-300">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              value={formData.name}
              onChange={handleChange}
              className="w-full bg-[#161b22] border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 transition"
              placeholder="Repository Name"
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm mb-1 text-gray-300">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              value={formData.description}
              onChange={handleChange}
              className="w-full bg-[#161b22] border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 transition"
              placeholder="Repository Description"
            ></textarea>
          </div>

          {/* Use Case */}
          <div>
            <label htmlFor="usecase" className="block text-sm mb-1 text-gray-300">
              Use Case
            </label>
            <input
              type="text"
              id="usecase"
              name="usecase"
              value={formData.usecase}
              onChange={handleChange}
              className="w-full bg-[#161b22] border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 transition"
              placeholder="Repository Use Case"
            />
          </div>

          {/* Frameworks */}
          <div>
            <label htmlFor="frameworks" className="block text-sm mb-1 text-gray-300">
              Frameworks
            </label>
            <input
              type="text"
              id="frameworks"
              name="frameworks"
              value={formData.frameworks}
              onChange={handleChange}
              className="w-full bg-[#161b22] border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 transition"
              placeholder="e.g., React, Next.js"
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="mt-4 w-full sm:w-fit px-6 py-2 bg-green-600 hover:bg-green-700 text-sm text-white font-medium rounded-md transition"
          >
            Create Repository
          </button>
        </form>
      </div>
    </section>
  );
};

export default Page;
