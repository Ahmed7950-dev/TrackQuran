export const getBirthdayStatus = (dob: string): 'TODAY' | 'TOMORROW' | 'NONE' => {
    if (!dob) return 'NONE';

    // Get today's date, ignoring the time component for accurate comparison
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    const birthDate = new Date(dob);
    
    const isBirthdayToday = today.getMonth() === birthDate.getMonth() && today.getDate() === birthDate.getDate();
    if (isBirthdayToday) return 'TODAY';

    const isBirthdayTomorrow = tomorrow.getMonth() === birthDate.getMonth() && tomorrow.getDate() === birthDate.getDate();
    if (isBirthdayTomorrow) return 'TOMORROW';

    return 'NONE';
};
