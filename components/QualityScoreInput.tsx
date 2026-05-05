import React from 'react';

interface QualityScoreInputProps {
  value: number | '';
  onChange: (value: number | '') => void;
}

const QualityScoreInput: React.FC<QualityScoreInputProps> = ({ value, onChange }) => {
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === '') {
      onChange('');
      return;
    }

    const num = parseInt(val, 10);
    // Allow typing numbers up to 10.
    if (!isNaN(num) && num >= 1 && num <= 10) {
      onChange(num);
    } else if (val === '1' || val === '0' || val === '') {
        // Allow user to start typing '10' or clear input
    }
  };

  return (
    <div className="flex items-center gap-2 mt-1">
      <input
        type="number"
        min="1"
        max="10"
        value={value}
        onChange={handleInputChange}
        className="w-full text-center bg-white dark:bg-gray-700 dark:text-white border border-slate-300 dark:border-gray-600 rounded-md shadow-sm py-1.5 focus:ring-teal-500 focus:border-teal-500 dark:focus:ring-orange-500 dark:focus:border-orange-500"
        placeholder="--"
      />
      <span className="font-medium text-slate-500 dark:text-slate-400">/ 10</span>
    </div>
  );
};

export default QualityScoreInput;