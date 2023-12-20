function getDateString(tm) {
    let date = new Date(tm * 1000); // add any date here

    let day = date.getDate();
    let month = date.getMonth();
    date.setMonth(month);

    // Format the date as a string as required here (DD Month YYYY)
    let newDate = day + ' ' + date.toLocaleString('default', { month: 'long' });
    return newDate;

}

function holdingTime(time) {
    let hour = Math.floor(time / 3600);
    let min = Math.floor((time % 3600) / 60);
    return `${hour} ${hour > 1 ? "Hours" : "Hour"} ${min > 0 && "and"} ${min} ${min > 0 && min > 1 ? "minutes" : "minute"}`;
}

export {
    getDateString,
    holdingTime
}