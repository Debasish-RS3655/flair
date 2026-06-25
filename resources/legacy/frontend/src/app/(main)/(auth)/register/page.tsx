'use client';

import { request } from '@/lib/requests';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const Page: React.FC = () => {
  const router = useRouter();
  const [base64Image, setBase64Image] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    name: '',
    displayText: '',
    bio: '',
  });
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setBase64Image(base64String);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    console.log('Form Submitted:', formData);
    try {
      const res = await request({
        method: 'PUT',
        url: `${process.env.NEXT_PUBLIC_API_URL}/user/update`,
        data: JSON.stringify({
          username: formData.username,
          metadata: {
            name: formData.name,
            displayText: formData.displayText,
            bio: formData.bio,
            profileImage: base64Image,
          },
        }),
        action: 'signin',
      });

      const data = await res.json();
      console.log('Response:', data);
      router.push(`/${data.data.username}`);
    } catch (err) {
      console.log('Error in submitting form', err);
    }
  };

  return (
    <section className="w-full min-h-screen flex flex-col items-center justify-center bg-[#0d1117] text-gray-200 px-4 sm:px-6 py-32">
      {/* Page Heading */}
      <h1 className="text-4xl font-bold text-white mb-8">Complete Your Profile</h1>

      <form className="w-full max-w-md flex flex-col gap-4" onSubmit={handleSubmit}>
        <label htmlFor="username" className="block text-sm mb-1 text-gray-300">
          Username <span className="text-red-500">*</span>
          <input
            type="text"
            id="username"
            name="username"
            required
            value={formData.username}
            onChange={handleChange}
            className="w-full bg-[#161b22] border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 transition"
            placeholder="Username"
          />
        </label>
        <label htmlFor="name" className="block text-sm mb-1 text-gray-300">
          Name <span className="text-red-500">*</span>
          <input
            type="text"
            id="name"
            name="name"
            required
            value={formData.name}
            onChange={handleChange}
            className="w-full bg-[#161b22] border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 transition"
            placeholder="Name"
          />
        </label>
        <label htmlFor="displayText" className="block text-sm mb-1 text-gray-300">
          Display Text <span className="text-red-500">*</span>
          <input
            type="text"
            id="displayText"
            name="displayText"
            required
            value={formData.displayText}
            onChange={handleChange}
            className="w-full bg-[#161b22] border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 transition"
            placeholder="Display Text"
          />
        </label>
        <label htmlFor="bio" className="block text-sm mb-1 text-gray-300">
          Bio <span className="text-red-500">*</span>
          <input
            type="text"
            id="bio"
            name="bio"
            required
            value={formData.bio}
            onChange={handleChange}
            className="w-full bg-[#161b22] border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 transition"
            placeholder="Bio"
          />
        </label>
        <label htmlFor="profileImage" className="block text-sm mb-1 text-gray-300">
          Profile Picture <span className="text-red-500">*</span>
          <input
            type="file"
            id="profileImage"
            name="profileImage"
            accept="image/*"
            onChange={handleImage}
            className="w-full bg-[#161b22] border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 transition"
          />
        </label>
        <button
          type="submit"
          className="mt-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 py-2 rounded transition"
        >
          Submit
        </button>
      </form>
    </section>
  );
};

export default Page;
