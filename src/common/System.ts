
export class SystemConsole
{
	static clear()
	{
		const isWin = process.platform === 'win32'; 
		console.clear();
		process.stdout.write(isWin ? '\x1Bc' : '\x1B[2J\x1B[0;0H');
	}
}
// clear();